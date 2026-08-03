import { handleBootstrapFailure } from './bootstrap/bootstrap-failure';
import { bootstrapApplicationContextRuntime } from './runtime/application-context-runtime.bootstrap';
import { MediaWorkerRuntimeModule } from './runtime/media-worker/media-worker-runtime.module';

bootstrapApplicationContextRuntime(MediaWorkerRuntimeModule, 'media-worker').catch(
  handleBootstrapFailure,
);
