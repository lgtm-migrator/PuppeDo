/* eslint-disable max-len */
import { Plugin, Plugins } from '../../PluginsCore';
import { Arguments } from '../../Arguments';
import { PluginArgsRedefine } from '../argsRedefine/argsRedefine';

import { PluginDocumentation, TestExtendType } from '../../global.d';

export type PluginContinueOnError = { continueOnError: boolean };

const name = 'continueOnError';

function plugin(): Plugin<PluginContinueOnError> {
  const allPlugins = this as Plugins;
  return new Plugin<PluginContinueOnError>({
    name,
    defaultValues: { continueOnError: false },
    propogationsAndShares: {
      fromPrevSublingSimple: ['continueOnError'],
    },
    hooks: {
      resolveValues: function resolveValues(inputs: TestExtendType & PluginContinueOnError): void {
        const self = this as Plugin<PluginContinueOnError>;

        const { PPD_CONTINUE_ON_ERROR_ENABLED } = {
          ...new Arguments().args,
          ...allPlugins.getValue<PluginArgsRedefine>('argsRedefine').argsRedefine,
        };

        self.values.continueOnError = PPD_CONTINUE_ON_ERROR_ENABLED
          ? inputs.continueOnError || self.values.continueOnError
          : false;
      },
    },
    allPlugins,
  });
}

const documentation: PluginDocumentation = {
  description: {
    ru: [
      'Булевое значение. Отвечает за поведение блока при ошибке.',
      'Управление происходит с помощью глобальной переменной [PPD_CONTINUE_ON_ERROR_ENABLED](#PPD_CONTINUE_ON_ERROR_ENABLED) уоторая включает и выключает данную функцию.',
      'При [PPD_CONTINUE_ON_ERROR_ENABLED](#PPD_CONTINUE_ON_ERROR_ENABLED) === false "continueOnError" игнорируется.',
      'Если continueOnError === true, то при ошибке в блоке он пропустится и пойдет следующий',
      'Если continueOnError === false, то при ошибке в блоке он выдаст ошибку',
    ],
    en: ['TODO'],
  },
  examples: [
    {
      test: 'src/Plugins/continueOnError/continueOnError.yaml',
      result: 'src.tests.e2e/snapshots/continueOnError.log',
    },
  ],
  name,
  type: 'plugin',
  propogation: false,
};

export default { name, documentation, plugin };
