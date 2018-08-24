const _ = require('lodash');

const { yaml2json } = require('./yaml2json');

const getFullDepthJSON = async function({ envs, filePath, testBody, testsFolder }){

  if (filePath && !_.isString(filePath)) {
    throw({ message: `yaml2json: Incorrect FILE NAME YAML/JSON/JS - ${filePath}` });
  };

  if (testBody && !_.isObject(testBody)) {
    throw({ message: `yaml2json: Incorrect TEST BODY YAML/JSON/JS - ${testBody}` });
  };

  if (!testsFolder && envs){
    testsFolder = envs.get('args.testsFolder');
  }

  let full = {};
  full = filePath ? (await yaml2json(filePath, testsFolder)).json : full;

  if (!full){
    throw({
      message: `Невозможно запустить в папке ${testsFolder} пустой тест ${filePath}`
    })
  }

  full = testBody ? Object.assign(full, testBody) : full;

  full.breadcrumbs = _.get(full, 'breadcrumbs', [filePath]);

  const runnerBlockNames = ['beforeTest', 'runTest', 'afterTest', 'errorTest']

  // Структура

  // runTest:
  // - testName:
  //     other: other

  // runTest:
  // - name: testName
  //   other: other

  // т.е. массив из объектов у которых только один ключ который является именем
  // или полный тест с полем имени

  for (const runnerBlock of runnerBlockNames){
    for (let runnerNum in _.get(full, runnerBlock, [])){
      let runner = _.get(full, [runnerBlock, runnerNum], {})
      let keys = Object.keys(runner);
      let name = null;
      let newRunner = {};

      if (keys && keys.length == 1) {
        name = keys[0];
        newRunner = _.clone(runner[name]) || newRunner;
        newRunner.name = name;
      }

      name = _.get(newRunner, 'name', null);

      if (name) {

        let breadcrumbs = _.clone(full.breadcrumbs);
        breadcrumbs.push(`${runnerBlock}[${runnerNum}].${name}`)
        newRunner.breadcrumbs = breadcrumbs;

        newRunner.type = 'test';

        if (name == 'log'){
          newRunner.type = 'log';
        }

        full[runnerBlock][runnerNum] = await getFullDepthJSON({
          filePath: name,
          testBody: newRunner,
          testsFolder: testsFolder
        })
      }
    }
  }

  full.name = _.get(full, 'name', filePath);

  return full;
}


module.exports = { getFullDepthJSON };