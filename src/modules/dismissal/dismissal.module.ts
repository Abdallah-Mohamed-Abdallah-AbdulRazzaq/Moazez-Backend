import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { RealtimeModule } from '../../infrastructure/realtime/realtime.module';
import { IamModule } from '../iam/iam.module';
import { CreateDismissalGateUseCase } from './gates/application/create-dismissal-gate.use-case';
import { GetDismissalGateUseCase } from './gates/application/get-dismissal-gate.use-case';
import { ListDismissalGatesUseCase } from './gates/application/list-dismissal-gates.use-case';
import { UpdateDismissalGateUseCase } from './gates/application/update-dismissal-gate.use-case';
import { DismissalGatesController } from './gates/controller/dismissal-gates.controller';
import { DismissalGatesRepository } from './gates/infrastructure/dismissal-gates.repository';
import { ListDismissalNotificationsUseCase } from './notifications/application/list-dismissal-notifications.use-case';
import { MarkAllDismissalNotificationsReadUseCase } from './notifications/application/mark-all-dismissal-notifications-read.use-case';
import { MarkDismissalNotificationReadUseCase } from './notifications/application/mark-dismissal-notification-read.use-case';
import { DismissalNotificationsController } from './notifications/controller/dismissal-notifications.controller';
import { DismissalNotificationsRepository } from './notifications/infrastructure/dismissal-notifications.repository';
import { GetDismissalProfileUseCase } from './profile/application/get-dismissal-profile.use-case';
import { DismissalProfileController } from './profile/controller/dismissal-profile.controller';
import { EscalateDismissalRequestUseCase } from './requests/application/escalate-dismissal-request.use-case';
import { ExpireDismissalRequestsUseCase } from './requests/application/expire-dismissal-requests.use-case';
import { GetDismissalRequestDetailUseCase } from './requests/application/get-dismissal-request-detail.use-case';
import { GetDismissalRequestHistoryDetailUseCase } from './requests/application/get-dismissal-request-history-detail.use-case';
import { ListDismissalPickupRecipientsUseCase } from './requests/application/list-dismissal-pickup-recipients.use-case';
import { ListActiveDismissalRequestsUseCase } from './requests/application/list-active-dismissal-requests.use-case';
import { ListDismissalRequestHistoryUseCase } from './requests/application/list-dismissal-request-history.use-case';
import { PickupRecipientTokenService } from './requests/application/pickup-recipient-token.service';
import { UpdateDismissalRequestStatusUseCase } from './requests/application/update-dismissal-request-status.use-case';
import { DeliverDismissalRequestUseCase } from './requests/application/deliver-dismissal-request.use-case';
import { DismissalRequestsController } from './requests/controller/dismissal-requests.controller';
import { DismissalRequestsDeliveryRepository } from './requests/infrastructure/dismissal-requests-delivery.repository';
import { DismissalRequestsExpiryRepository } from './requests/infrastructure/dismissal-requests-expiry.repository';
import { DismissalRequestsHistoryRepository } from './requests/infrastructure/dismissal-requests-history.repository';
import { DismissalRequestsReadRepository } from './requests/infrastructure/dismissal-requests-read.repository';
import { DismissalRequestsWriteRepository } from './requests/infrastructure/dismissal-requests-write.repository';
import { DismissalRequestExpiryWorker } from './requests/worker/dismissal-request-expiry.worker';
import { DismissalRealtimeEventsService } from './realtime/dismissal-realtime-events.service';
import { DismissalRealtimeRepository } from './realtime/dismissal-realtime.repository';
import { ConfirmStudentArrivalUseCase } from './waiting-students/application/confirm-student-arrival.use-case';
import { ListWaitingStudentsUseCase } from './waiting-students/application/list-waiting-students.use-case';
import { DismissalWaitingStudentsController } from './waiting-students/controller/dismissal-waiting-students.controller';
import { GetDismissalSettingsUseCase } from './settings/application/get-dismissal-settings.use-case';
import { UpdateDismissalSettingsUseCase } from './settings/application/update-dismissal-settings.use-case';
import { DismissalSettingsController } from './settings/controller/dismissal-settings.controller';
import { DismissalSettingsRepository } from './settings/infrastructure/dismissal-settings.repository';
import { CreateDismissalStaffAssignmentUseCase } from './staff-assignments/application/create-dismissal-staff-assignment.use-case';
import { DeleteDismissalStaffAssignmentUseCase } from './staff-assignments/application/delete-dismissal-staff-assignment.use-case';
import { GetDismissalStaffAssignmentUseCase } from './staff-assignments/application/get-dismissal-staff-assignment.use-case';
import { ListDismissalStaffAssignmentsUseCase } from './staff-assignments/application/list-dismissal-staff-assignments.use-case';
import { UpdateDismissalStaffAssignmentUseCase } from './staff-assignments/application/update-dismissal-staff-assignment.use-case';
import { DismissalStaffAssignmentsController } from './staff-assignments/controller/dismissal-staff-assignments.controller';
import { DismissalStaffAssignmentsRepository } from './staff-assignments/infrastructure/dismissal-staff-assignments.repository';

@Module({
  imports: [IamModule, QueueModule, RealtimeModule],
  controllers: [
    DismissalSettingsController,
    DismissalGatesController,
    DismissalProfileController,
    DismissalStaffAssignmentsController,
    DismissalRequestsController,
    DismissalWaitingStudentsController,
    DismissalNotificationsController,
  ],
  providers: [
    DismissalSettingsRepository,
    DismissalGatesRepository,
    DismissalStaffAssignmentsRepository,
    DismissalRequestsReadRepository,
    DismissalRequestsWriteRepository,
    DismissalRequestsDeliveryRepository,
    DismissalRequestsExpiryRepository,
    DismissalRequestsHistoryRepository,
    DismissalRealtimeRepository,
    DismissalRealtimeEventsService,
    DismissalNotificationsRepository,
    GetDismissalSettingsUseCase,
    UpdateDismissalSettingsUseCase,
    ListDismissalGatesUseCase,
    CreateDismissalGateUseCase,
    GetDismissalGateUseCase,
    UpdateDismissalGateUseCase,
    GetDismissalProfileUseCase,
    ListDismissalStaffAssignmentsUseCase,
    CreateDismissalStaffAssignmentUseCase,
    GetDismissalStaffAssignmentUseCase,
    UpdateDismissalStaffAssignmentUseCase,
    DeleteDismissalStaffAssignmentUseCase,
    ListActiveDismissalRequestsUseCase,
    GetDismissalRequestDetailUseCase,
    ListDismissalRequestHistoryUseCase,
    GetDismissalRequestHistoryDetailUseCase,
    ListDismissalPickupRecipientsUseCase,
    UpdateDismissalRequestStatusUseCase,
    EscalateDismissalRequestUseCase,
    DeliverDismissalRequestUseCase,
    ExpireDismissalRequestsUseCase,
    DismissalRequestExpiryWorker,
    PickupRecipientTokenService,
    ListWaitingStudentsUseCase,
    ConfirmStudentArrivalUseCase,
    ListDismissalNotificationsUseCase,
    MarkDismissalNotificationReadUseCase,
    MarkAllDismissalNotificationsReadUseCase,
  ],
  exports: [
    DismissalSettingsRepository,
    DismissalGatesRepository,
    DismissalStaffAssignmentsRepository,
    DismissalRequestsReadRepository,
    DismissalRequestsWriteRepository,
    DismissalRequestsDeliveryRepository,
    DismissalRequestsExpiryRepository,
    DismissalRequestsHistoryRepository,
    DismissalRealtimeEventsService,
    ExpireDismissalRequestsUseCase,
  ],
})
export class DismissalModule {}
