const crypto = require('crypto');

const _ = require('lodash');
const { TestsContent } = require('./TestContent');
const Environment = require('./env');

const RUNNER_BLOCK_NAMES = ['beforeTest', 'runTest', 'afterTest', 'errorTest'];

const generateDescriptionStep = fullJSON => {
  const { description, name, todo, levelIndent } = fullJSON;

  const descriptionString = [
    '   '.repeat(levelIndent),
    todo ? 'TODO: ' + todo + '== ' : '',
    description ? `${description} ` : '',
    name ? `(${name})` : '',
    '\n',
  ].join('');

  return descriptionString;
};

const getFullDepthJSON = ({ testName, testBody = {}, levelIndent = 0, envsId = null } = {}) => {
  if (!testName) {
    testName = Environment({ envsId }).envs.get('current.test');
  }
  const allTests = new TestsContent().getAllData();
  if (!allTests) {
    throw { message: 'No tests content. Init it first with "TestsContent" class' };
  }

  const testJSON = { ...allTests.allContent.find(v => v.name === testName && ['atom', 'test'].includes(v.type)) };
  if (!testJSON) {
    throw { message: `Test with name '${testName}' not found in root folder and additional folders` };
  }

  const fullJSON = _.cloneDeep({ ...testJSON, ...testBody });
  fullJSON.breadcrumbs = _.get(fullJSON, 'breadcrumbs', [testName]);
  fullJSON.levelIndent = levelIndent;
  fullJSON.stepId = crypto.randomBytes(16).toString('hex');

  let textDescription = generateDescriptionStep(fullJSON);

  for (const runnerBlock of RUNNER_BLOCK_NAMES) {
    let runnerBlockValue = _.get(fullJSON, [runnerBlock]);
    if (_.isArray(runnerBlockValue)) {
      for (const runnerNum in runnerBlockValue) {
        const runner = _.get(runnerBlockValue, [runnerNum], {});
        let [name, newRunner] = Object.entries(runner)[0] || [null, {}];
        newRunner = newRunner || {};
        if (name) {
          newRunner.name = name;
          newRunner.breadcrumbs = [...fullJSON.breadcrumbs, `${runnerBlock}[${runnerNum}].${name}`];
          const { fullJSON: fullJSONResponse, textDescription: textDescriptionResponse } = getFullDepthJSON({
            testName: name,
            testBody: newRunner,
            levelIndent: levelIndent + 1,
          });

          fullJSON[runnerBlock][runnerNum] = fullJSONResponse;
          textDescription += textDescriptionResponse;
        }
      }
    } else if (!_.isString(runnerBlockValue) && !_.isArray(runnerBlockValue) && !_.isUndefined(runnerBlockValue)) {
      throw {
        message: `Running block '${runnerBlock}' in test '${fullJSON.name}' in file '${fullJSON.testFile}' must be array of tests`,
      };
    }
  }

  fullJSON.name = _.get(fullJSON, 'name', testName);

  return { fullJSON, textDescription };
};

module.exports = { getFullDepthJSON };
