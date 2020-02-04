const path = require('path');
const fs = require('fs');

const _ = require('lodash');
require('polyfill-object.fromentries');
require('array-flat-polyfill');
const dayjs = require('dayjs');
const yaml = require('js-yaml');

const { sleep, stylesConsole } = require('./helpers');
const { Arguments } = require('./Arguments');
const Environment = require('./env');

class Log {
  constructor({ envsId } = {}) {
    this.envsId = envsId;
    this.init();
  }

  init() {
    const { socket, envs } = Environment({ envsId: this.envsId });
    this.envs = envs;
    this.socket = socket;
    this.binded = {};
  }

  bindData(data = {}) {
    this.binded = { ...this.binded, ...data };
  }

  checkLevel(level) {
    const levels = {
      0: 'raw',
      1: 'timer',
      2: 'debug',
      3: 'info',
      4: 'test',
      5: 'warn',
      6: 'error',
      7: 'env',
      raw: 0,
      timer: 1,
      debug: 2,
      info: 3,
      test: 4,
      warn: 5,
      error: 6,
      env: 7,
    };

    const { PPD_LOG_LEVEL_TYPE } = new Arguments();

    const inputLevel = _.isNumber(level) ? level : _.get(levels, level, 0);
    const limitLevel = _.get(levels, PPD_LOG_LEVEL_TYPE, 0);

    // If input level higher or equal then logging
    if (limitLevel <= inputLevel || levels[inputLevel] === 'error') {
      return levels[inputLevel];
    } else {
      return false;
    }
  }

  async saveScreenshot({ selCSS = false, fullpage = false, element = false } = {}) {
    try {
      // Active ENV log settings
      let activeEnv = this.envs.getEnv();
      let pageName = this.envs.get('current.page');

      const now = dayjs().format('YYYY-MM-DD_HH-mm-ss.SSS');
      const name = `${now}.png`;

      // TODO: 2020-02-02 S.Starodubov вынести это в функцию
      if (!this.envs.get('output.folder') || !this.envs.get('output.folderLatest')) {
        console.log('There is no output folder for screenshot');
        return;
      }

      const pathScreenshot = path.join(this.envs.get('output.folder'), name);
      const pathScreenshotLatest = path.join(this.envs.get('output.folderLatest'), name);

      const page = _.get(activeEnv, `state.pages.${pageName}`);

      if (_.isObject(page)) {
        if (selCSS) {
          const el = await page.$(selCSS);
          await el.screenshot({ path: pathScreenshot });
        }
        if (element && _.isObject(element) && !_.isEmpty(element)) {
          await element.screenshot({ path: pathScreenshot });
        }
        if (fullpage) {
          await page.screenshot({ path: pathScreenshot, fullPage: true });
        }
        fs.copyFileSync(pathScreenshot, pathScreenshotLatest);
        // Timeout after screenshot
        await sleep(25);

        // TODO: 2020-02-02 S.Starodubov сделать запись в логе что сделан скриншот
        return name;
      } else {
        return false;
      }
    } catch (err) {
      err.message += ` || saveScreenshot selCSS = ${selCSS}`;
      err.socket = this.socket;
      throw err;
    }
  }

  consoleLog(level, levelIndent, fullLogString) {
    const { PPD_LOG_EXTEND } = new Arguments();
    const styleFunction = _.get(stylesConsole, level, args => args);
    const breadcrumbs = _.get(this.binded, ['testSource', 'breadcrumbs'], []);

    console.log(styleFunction(fullLogString));

    if (breadcrumbs.length && level !== 'raw' && PPD_LOG_EXTEND) {
      const styleFunctionInfo = _.get(stylesConsole, 'info', args => args);
      const head = `${' '.repeat(20)} ${' | '.repeat(levelIndent)}`;
      const tail = `[${breadcrumbs.join(' -> ')}]`;
      console.log(styleFunctionInfo(`${head} ${tail}`));
      // TODO: 2020-02-02 S.Starodubov надо сделать после запись в файл, а то пишется перед тем что надо
      // console.log(styleFunction(head), styleFunctionInfo(tail));
      // this.fileLog(`${head} ${tail}`, 'output.log');
    }
  }

  fileLog(fullLogString = '', fileName = 'output.log') {
    const { folder, folderLatest } = _.get(this.envs, 'output', {});
    if (!folder || !folderLatest) {
      throw { message: 'There is no output folder' };
    }

    fs.appendFileSync(path.join(folder, fileName), fullLogString + '\n');
    fs.appendFileSync(path.join(folderLatest, fileName), fullLogString + '\n');
  }

  async log({
    funcFile,
    testFile,
    text = '',
    stdOut = true,
    selCSS = [],
    screenshot = null,
    fullpage = null,
    level = 'info',
    element = false,
    testStruct = null,
    levelIndent = 0,
    error = {},
    testSource = this.binded.testSource,
    bindedData = this.binded.bindedData,
  }) {
    const {
      PPD_DEBUG_MODE,
      PPD_LOG_DISABLED,
      PPD_LOG_LEVEL_NESTED,
      PPD_LOG_SCREENSHOT,
      PPD_LOG_FULLPAGE,
    } = new Arguments();

    level = this.checkLevel(level);
    if (!level) return;

    // SKIP LOG BY LEVEL
    if (PPD_LOG_LEVEL_NESTED && levelIndent > PPD_LOG_LEVEL_NESTED && level !== 'error') {
      return;
    }

    try {
      screenshot = PPD_LOG_SCREENSHOT ? screenshot : false;
      fullpage = PPD_LOG_FULLPAGE ? fullpage : false;

      const now = dayjs();
      const nowWithPad = `${now.format('HH:mm:ss.SSS')} - ${level.padEnd(5)}`;
      const logStrings = [`${nowWithPad} ${' | '.repeat(levelIndent)} ${text}`];

      if (level === 'error') {
        const breadcrumbs = _.get(this.binded, ['testSource', 'breadcrumbs'], []);
        breadcrumbs.forEach((v, i) => {
          logStrings.push(`${nowWithPad} ${' | '.repeat(i)} ${v}`);
        });
        testFile && logStrings.push(`${nowWithPad} ${' | '.repeat(levelIndent)} [${testFile}]`);
        funcFile && logStrings.push(`${nowWithPad} ${' | '.repeat(levelIndent)} [${funcFile}]`);
      }

      // STDOUT
      if (stdOut) {
        this.consoleLog(level, levelIndent, logStrings.join('\n'));
      }

      // NO LOG FILES ONLY STDOUT
      if (PPD_LOG_DISABLED && level !== 'error') {
        return;
      }

      // EXPORT TEXT LOG
      this.fileLog(logStrings.join('\n'), 'output.log');

      // SCREENSHOT ON ERROR
      if (level === 'error' && levelIndent === 0) {
        [screenshot, fullpage] = [true, true];
      }

      // SCRENSHOTS
      const screenshots = [];
      if (screenshot) {
        let src;
        selCSS = selCSS && !_.isArray(selCSS) ? [selCSS.toString()] : selCSS || [];
        for (let css in selCSS) {
          src = await this.saveScreenshot({ selCSS: selCSS[css] });
          src ? screenshots.push(src) : null;
        }
        src = element ? await this.saveScreenshot({ element }) : null;
        src ? screenshots.push(src) : null;
        src = fullpage ? await this.saveScreenshot({ fullpage }) : null;
        src ? screenshots.push(src) : null;
      }

      // ENVS TO LOG
      let dataEnvs = null;
      if (level == 'env') {
        dataEnvs = _.mapValues(_.get(this.envs, ['envs'], {}), val => {
          return _.omit(val, 'state');
        });
      }

      if (_.isEmpty(testStruct)) {
        testStruct = _.mapValues(testSource, v => {
          if (!_.isEmpty(v)) {
            return v;
          }
        });
      }

      const logEntry = {
        text,
        time: now.format('YYYY-MM-DD_HH-mm-ss.SSS'),
        // TODO: 2020-02-02 S.Starodubov разобраться с этими двумя, они нужны для хтмлки
        dataEnvs,
        dataEnvsGlobal: level == 'env' ? _.pick(this.envs, ['args', 'current', 'data', 'results', 'selectors']) : null,
        testStruct: PPD_DEBUG_MODE || level == 'env' ? testStruct : null,
        bindedData: PPD_DEBUG_MODE ? bindedData : null,
        screenshots,
        type: level == 'env' ? 'env' : 'log',
        level,
        levelIndent,
        stepId: _.get(bindedData, 'stepId'),
      };
      this.envs.push('log', logEntry);
      this.socket.sendYAML({ type: 'log', data: logEntry, envsId: this.envsId });

      // Export YAML log every step
      let yamlString = '-\n' + yaml.dump(logEntry, { lineWidth: 1000, indent: 2 }).replace(/^/gm, ' '.repeat(2));
      this.fileLog(yamlString, 'output.yaml');
    } catch (err) {
      err.message += ' || error in log';
      err.socket = this.socket;
      err.debug = PPD_DEBUG_MODE;
      err.stepId = _.get(bindedData, 'stepId');
      throw err;
    }
  }
}

module.exports = Log;
