import { handleBootstrapFailure } from './bootstrap/bootstrap-failure';
import { bootstrapApplicationContextRuntime } from './runtime/application-context-runtime.bootstrap';
import { CoreWorkerRuntimeModule } from './runtime/core-worker/core-worker-runtime.module';

bootstrapApplicationContextRuntime(CoreWorkerRuntimeModule, 'core-worker').catch(
  handleBootstrapFailure,
);
