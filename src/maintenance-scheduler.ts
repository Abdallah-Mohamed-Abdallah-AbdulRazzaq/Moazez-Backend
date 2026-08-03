import { handleBootstrapFailure } from './bootstrap/bootstrap-failure';
import { bootstrapApplicationContextRuntime } from './runtime/application-context-runtime.bootstrap';
import { MaintenanceSchedulerRuntimeModule } from './runtime/maintenance-scheduler/maintenance-scheduler-runtime.module';

bootstrapApplicationContextRuntime(
  MaintenanceSchedulerRuntimeModule,
  'maintenance-scheduler',
).catch(handleBootstrapFailure);
