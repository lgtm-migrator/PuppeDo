/* eslint-disable no-await-in-loop */
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import crypto from 'crypto';

import isEmpty from 'lodash/isEmpty';

import dayjs from 'dayjs';
import fetch from 'node-fetch';
import walkSync from 'walk-sync';

import { merge, sleep, blankSocket } from './Helpers';
import TestsContent from './TestContent';
import Arguments from './Arguments';
import Env from './Env';

type PagesType = {
  main?: any;
};

type Options = {
  headless: any;
  slowMo: any;
  args: any;
  devtools?: any;
};

interface EnvsPoolType {
  envs: any;
  data: Object;
  selectors: Object;
  current: {
    name?: string;
    page?: string | null;
    test?: any;
  };
  results: any;
  args: any;
  output: {
    folder?: string;
    folderLatest?: string;
    folderLatestFull?: string;
    output?: string;
    name?: string;
    folderFull?: string;
  };
  log: any;
}

type EnvsInstanceType = {
  envsPool: EnvsPool;
  socket: SocketType;
  envsId: string;
};

class EnvsPool implements EnvsPoolType {
  envs: any;
  data: Object;
  selectors: Object;
  current: {
    name?: string;
    page?: string | null;
    test?: any;
  };
  results: any;
  args: any;
  output: {
    folder?: string;
    folderLatest?: string;
    folderLatestFull?: string;
    output?: string;
    name?: string;
    folderFull?: string;
  };
  log: any;

  constructor() {
    this.envs = {};
    this.data = {};
    this.selectors = {};
    this.current = {};
    this.results = {};
    this.output = {};
    this.log = [];
  }

  setEnv(name: string, page: string = ''): void {
    if (name && Object.keys(this.envs).includes(name)) {
      this.current.name = name;
      if (page && this.envs[name]?.state?.pages[page]) {
        this.current.page = page;
      } else if (this.envs[name]?.state?.pages?.main) {
        this.current.page = 'main';
      } else {
        this.current.page = null;
      }
    }
  }

  getActivePage(): any {
    const activeEnv = this.envs[this.current?.name || ''] || {};
    const pageName = this.current?.page;
    return activeEnv.state.pages[pageName || ''];
  }

  getOutputsFolders(): { folder: string; folderLatest: string } {
    const { folder, folderLatest } = this.output;
    if (!folder || !folderLatest) {
      throw new Error('There is no output folder');
    }
    return { folder, folderLatest };
  }

  static resolveOutputFile(): string {
    const outputSourceRaw = path.resolve(path.join('dist', 'output.html'));
    const outputSourceModule = path.resolve(
      path.join(__dirname, '..', 'node_modules', '@puppedo', 'core', 'dist', 'output.html'),
    );
    const outputSource = fs.existsSync(outputSourceRaw) ? outputSourceRaw : outputSourceModule;
    return outputSource;
  }

  initOutput(testName = 'test'): void {
    const { PPD_OUTPUT: output } = new Arguments().args;

    if (!fs.existsSync(output)) {
      fs.mkdirSync(output);
    }
    const now = dayjs().format('YYYY-MM-DD_HH-mm-ss.SSS');

    const folder = path.join(output, `${now}_${testName}`);
    fs.mkdirSync(folder);

    fs.copyFileSync(EnvsPool.resolveOutputFile(), path.join(folder, 'output.html'));

    this.output.output = output;
    this.output.name = testName;
    this.output.folder = folder;
    this.output.folderFull = path.resolve(folder);

    this.initOutputLatest();
  }

  initOutputLatest(): void {
    const { PPD_OUTPUT: output } = new Arguments().args;

    const folderLatest = path.join(output, 'latest');

    if (!fs.existsSync(output)) {
      fs.mkdirSync(output);
    }

    // Create latest log path
    if (!fs.existsSync(folderLatest)) {
      fs.mkdirSync(folderLatest);
    } else {
      const filesExists = walkSync(folderLatest);
      for (let i = 0; i < filesExists.length; i += 1) {
        fs.unlinkSync(path.join(folderLatest, filesExists[i]));
      }
    }

    fs.copyFileSync(EnvsPool.resolveOutputFile(), path.join(folderLatest, 'output.html'));

    this.output.folderLatest = folderLatest;
    this.output.folderLatestFull = path.resolve(folderLatest);

    // Drop this function after first use
    this.initOutputLatest = (): void => {};
  }

  async runBrowsers(): Promise<void> {
    const envsNames = Object.keys(this.envs);
    for (let i = 0; i < envsNames.length; i += 1) {
      const envPool = this.envs[envsNames[i]];
      const browserSettings = envPool.env.browser;
      const { type = 'browser', engine = 'playwright', runtime = 'run' } = browserSettings;

      if (
        !['api', 'browser', 'electron'].includes(type) ||
        !['puppeteer', 'playwright'].includes(engine) ||
        !['run', 'connect'].includes(runtime)
      ) {
        throw new Error(`Error in environment browser parametr: '${JSON.stringify(browserSettings)}'`);
      }

      if (type === 'api') {
        // TODO: 2020-01-13 S.Starodubov
      }

      if (type === 'browser') {
        if (runtime === 'run') {
          if (engine === 'puppeteer') {
            const { browser, pages } = await EnvsPool.runPuppeteer(browserSettings);
            envPool.state = { ...envPool.state, ...{ browser, pages } };
          }
          if (engine === 'playwright') {
            const { browser, pages } = await EnvsPool.runPlaywright(browserSettings);
            envPool.state = { ...envPool.state, ...{ browser, pages } };
          }
        }
      }

      if (type === 'electron') {
        if (runtime === 'connect') {
          const { browser, pages } = await EnvsPool.connectElectron(browserSettings);
          envPool.state = { ...envPool.state, ...{ browser, pages } };
        }
        if (runtime === 'run') {
          const { browser, pages, pid } = await this.runElectron(browserSettings, envPool.name);
          envPool.state = { ...envPool.state, ...{ browser, pages, pid } };
        }
      }
    }

    this.runBrowsers = async (): Promise<void> => {};
  }

  static async runPuppeteer(browserSettings: EnvBrowserType): Promise<EnvStateType> {
    const { PPD_DEBUG_MODE = false } = new Arguments().args;
    const { headless = true, slowMo = 0, args = [], windowSize = {} } = browserSettings;

    // eslint-disable-next-line no-undef
    const puppeteer = __non_webpack_require__('puppeteer');
    const browser = await puppeteer.launch({ headless, slowMo, args, devtools: PPD_DEBUG_MODE });

    const page = await browser.newPage();
    const pages = { main: page };

    const { width, height } = windowSize;
    if (width && height) {
      await pages.main.setViewport({ width, height });
    }

    return { browser, pages };
  }

  static async runPlaywright(browserSettings: EnvBrowserType): Promise<EnvStateType> {
    const { PPD_DEBUG_MODE = false } = new Arguments().args;
    const { headless = true, slowMo = 0, args = [], browserName = 'chromium', windowSize = {} } = browserSettings;
    const { width = 1024, height = 768 } = windowSize;

    const options: Options = { headless, slowMo, args };
    if (browserName === 'chromium') {
      options.devtools = PPD_DEBUG_MODE;
    }

    // eslint-disable-next-line no-undef
    const playwright = __non_webpack_require__('playwright');
    const browser = await playwright[browserName].launch(options);
    const context = await browser.newContext();
    const page = await context.newPage({ viewport: { width, height } });

    const pages = { main: page };
    const contexts = { main: context };

    return { browser, contexts, pages };
  }

  static async connectElectron(browserSettings: EnvBrowserType): Promise<EnvStateType> {
    const { urlDevtoolsJson, windowSize = {}, slowMo = 0 } = browserSettings;

    if (urlDevtoolsJson) {
      const jsonPagesResponse = await fetch(`${urlDevtoolsJson}json`, { method: 'GET' });
      const jsonBrowserResponse = await fetch(`${urlDevtoolsJson}json/version`, { method: 'GET' });

      const jsonPages = await jsonPagesResponse.json();
      const jsonBrowser = await jsonBrowserResponse.json();

      if (!jsonBrowser || !jsonPages) {
        throw new Error(`Can't connect to ${urlDevtoolsJson}`);
      }

      const { webSocketDebuggerUrl } = jsonBrowser;
      if (!webSocketDebuggerUrl) {
        throw new Error('webSocketDebuggerUrl empty. Possibly wrong Electron version running');
      }

      // eslint-disable-next-line no-undef
      const puppeteer = __non_webpack_require__('puppeteer');
      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        ignoreHTTPSErrors: true,
        slowMo,
      });

      const pagesRaw = await browser.pages();
      let pages: PagesType = {};
      if (pagesRaw.length) {
        pages = { main: pagesRaw[0] };
      } else {
        throw new Error('Can`t find any pages in connection');
      }

      const { width, height } = windowSize;
      if (width && height) {
        await pages.main.setViewport({ width, height });
      }

      return { browser, pages };
    }

    throw new Error(`Can't connect to Electron ${urlDevtoolsJson}`);
  }

  async runElectron(browserSettings: EnvBrowserType, envName: string): Promise<EnvStateType> {
    const runtimeExecutable = browserSettings?.runtimeEnv?.runtimeExecutable;
    const program = browserSettings?.runtimeEnv?.program || '';
    const cwd = browserSettings?.runtimeEnv?.cwd || '';
    const browserArgs = browserSettings?.runtimeEnv?.args || [];
    const browserEnv = browserSettings?.runtimeEnv?.env || {};
    const pauseAfterStartApp = browserSettings?.runtimeEnv?.pauseAfterStartApp || 5000;
    const runArgs = [program, ...browserArgs];

    const { folder, folderLatest } = this.output;

    if (runtimeExecutable && folder && folderLatest) {
      process.env = { ...process.env, ...browserEnv };

      const prc = spawn(runtimeExecutable, runArgs, { cwd, env: process.env });

      if (prc) {
        fs.writeFileSync(path.join(folder, `${envName}.log`), '');
        fs.writeFileSync(path.join(folderLatest, `${envName}.log`), '');

        prc.stdout.on('data', (data) => {
          fs.appendFileSync(path.join(folder, `${envName}.log`), String(data));
          fs.appendFileSync(path.join(folderLatest, `${envName}.log`), String(data));
        });
      }

      await sleep(pauseAfterStartApp);

      const { browser, pages } = await EnvsPool.connectElectron(browserSettings);
      return { browser, pages, pid: prc.pid };
    }
    throw new Error(`Can't run Electron ${runtimeExecutable}`);
  }

  async closeBrowsers(): Promise<void> {
    for (let i = 0; i < Object.keys(this.envs).length; i += 1) {
      const key = Object.keys(this.envs)[i];
      const { state } = this.envs[key];
      try {
        state.browser.close();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(error);
      }
    }
  }

  async closeProcesses(): Promise<void> {
    for (let i = 0; i < Object.keys(this.envs).length; i += 1) {
      const key = Object.keys(this.envs)[i];
      const killOnEnd = this.envs[key]?.env?.browser?.killOnEnd || true;
      const killProcessName = this.envs[key]?.env?.browser?.killProcessName;
      try {
        if (killOnEnd && killProcessName) {
          spawnSync('taskkill', ['/f', '/im', killProcessName]);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(error);
      }
    }
  }

  static async resolveLinks(): Promise<Array<EnvType>> {
    const { args } = new Arguments();
    const { allData } = new TestsContent();
    const { envs: envsAll, data: dataAll, selectors: selectorsAll } = allData;

    // ENVS RESOLVING
    const envsResult: Array<EnvType> = args.PPD_ENVS.map((v: string) => {
      const env = JSON.parse(JSON.stringify(envsAll.find((g: EnvType) => g.name === v)));
      if (env) {
        const { dataExt = [], selectorsExt = [], envsExt = [], data: dataEnv = {}, selectors: selectorsEnv = {} } = env;

        envsExt.forEach((envsExtName: string) => {
          const envsResolved: EnvType | undefined = envsAll.find((g: EnvType) => g.name === envsExtName);
          if (envsResolved) {
            env.browser = merge(env.browser || {}, envsResolved.browser || {});
            env.log = merge(env.log || {}, envsResolved.log || {});
            env.data = merge(env.data || {}, envsResolved.data || {});
            env.selectors = merge(env.selectors || {}, envsResolved.selectors || {});
            env.description = `${env.description || ''} -> ${envsResolved.description || ''}`;
          } else {
            throw new Error(`PuppeDo can't resolve extended environment '${envsExtName}' in environment '${env.name}'`);
          }
        });

        dataExt.forEach((dataExtName: string) => {
          const dataResolved: DataType | undefined = dataAll.find((g: DataType) => g.name === dataExtName);
          if (dataResolved) {
            env.data = merge(env.data || {}, dataResolved.data || {}, dataEnv);
          } else {
            throw new Error(`PuppeDo can't resolve extended data '${dataExtName}' in environment '${env.name}'`);
          }
        });

        selectorsExt.forEach((selectorsExtName: string) => {
          const selectorsResolved: DataType | undefined = selectorsAll.find(
            (g: DataType) => g.name === selectorsExtName,
          );
          if (selectorsResolved) {
            env.selectors = merge(env.selectors || {}, selectorsResolved.data || {}, selectorsEnv);
          } else {
            throw new Error(
              `PuppeDo can't resolve extended selectors '${selectorsExtName}' in environment '${env.name}'`,
            );
          }
        });

        return env;
      }
      throw new Error(`PuppeDo found unknown environment in yours args. It's name '${v}'.`);
    });

    return envsResult;
  }

  async init(runBrowsers: boolean = true): Promise<void> {
    const { args } = new Arguments();
    const envs: Array<EnvType> = await EnvsPool.resolveLinks();
    const { PPD_DATA: data = {}, PPD_SELECTORS: selectors = {} } = args;
    this.args = args;
    this.data = data;
    this.selectors = selectors;

    envs.forEach((env: EnvType) => {
      const envLocal = { ...env };
      const newEnv = new Env(envLocal);
      this.envs[newEnv.name] = newEnv;
    });

    if (!this.envs || isEmpty(this.envs)) {
      throw new Error("Can't init any environment. Check 'envs' parameter, should be array");
    }

    if (runBrowsers) {
      await this.runBrowsers();
    }

    // If already init do nothing
    this.init = async (): Promise<void> => {};
  }

  setCurrentTest(testName: string = ''): void {
    if (testName) {
      this.current.test = testName;
      this.initOutput(testName);
    }
  }
}

const instances: { [key: string]: EnvsInstanceType } = {};

export default (envsId: string = '', testName: string = '', socket: SocketType = blankSocket): EnvsInstanceType => {
  let envsIdLocal = envsId;
  if (envsIdLocal) {
    if (!instances[envsIdLocal]) {
      throw new Error(`Unknown ENV ID ${envsIdLocal}`);
    }
  } else {
    envsIdLocal = crypto.randomBytes(16).toString('hex');
    const newEnvs = new EnvsPool();
    instances[envsIdLocal] = { envsPool: newEnvs, socket, envsId: envsIdLocal };
  }

  instances[envsIdLocal].envsPool.setCurrentTest(testName);

  return instances[envsIdLocal];
};
