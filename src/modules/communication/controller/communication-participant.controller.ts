import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  AcceptCommunicationInviteUseCase,
  AddCommunicationParticipantUseCase,
  ApproveCommunicationJoinRequestUseCase,
  CreateCommunicationInviteUseCase,
  CreateCommunicationJoinRequestUseCase,
  DemoteCommunicationParticipantUseCase,
  LeaveCommunicationConversationUseCase,
  ListCommunicationInvitesUseCase,
  ListCommunicationJoinRequestsUseCase,
  ListCommunicationParticipantsUseCase,
  PromoteCommunicationParticipantUseCase,
  RejectCommunicationInviteUseCase,
  RejectCommunicationJoinRequestUseCase,
  RemoveCommunicationParticipantUseCase,
  UpdateCommunicationParticipantUseCase,
} from '../application/communication-participant.use-cases';
import {
  AddCommunicationParticipantDto,
  ApproveCommunicationJoinRequestDto,
  CreateCommunicationInviteDto,
  CreateCommunicationJoinRequestDto,
  DemoteCommunicationParticipantDto,
  PromoteCommunicationParticipantDto,
  RejectCommunicationInviteDto,
  RejectCommunicationJoinRequestDto,
  UpdateCommunicationParticipantDto,
} from '../dto/communication-participant.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication')
export class CommunicationParticipantController {
  constructor(
    private readonly listCommunicationParticipantsUseCase: ListCommunicationParticipantsUseCase,
    private readonly addCommunicationParticipantUseCase: AddCommunicationParticipantUseCase,
    private readonly updateCommunicationParticipantUseCase: UpdateCommunicationParticipantUseCase,
    private readonly removeCommunicationParticipantUseCase: RemoveCommunicationParticipantUseCase,
    private readonly leaveCommunicationConversationUseCase: LeaveCommunicationConversationUseCase,
    private readonly promoteCommunicationParticipantUseCase: PromoteCommunicationParticipantUseCase,
    private readonly demoteCommunicationParticipantUseCase: DemoteCommunicationParticipantUseCase,
    private readonly listCommunicationInvitesUseCase: ListCommunicationInvitesUseCase,
    private readonly createCommunicationInviteUseCase: CreateCommunicationInviteUseCase,
    private readonly acceptCommunicationInviteUseCase: AcceptCommunicationInviteUseCase,
    private readonly rejectCommunicationInviteUseCase: RejectCommunicationInviteUseCase,
    private readonly listCommunicationJoinRequestsUseCase: ListCommunicationJoinRequestsUseCase,
    private readonly createCommunicationJoinRequestUseCase: CreateCommunicationJoinRequestUseCase,
    private readonly approveCommunicationJoinRequestUseCase: ApproveCommunicationJoinRequestUseCase,
    private readonly rejectCommunicationJoinRequestUseCase: RejectCommunicationJoinRequestUseCase,
  ) {}

  @Get('conversations/:conversationId/participants')
  @RequiredPermissions('communication.conversations.view')
  listParticipants(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.listCommunicationParticipantsUseCase.execute(conversationId);
  }

  @Post('conversations/:conversationId/participants')
  @RequiredPermissions('communication.participants.manage')
  addParticipant(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: AddCommunicationParticipantDto,
  ) {
    return this.addCommunicationParticipantUseCase.execute(conversationId, dto);
  }

  @Patch('conversations/:conversationId/participants/:participantId')
  @RequiredPermissions('communication.participants.manage')
  updateParticipant(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Body() dto: UpdateCommunicationParticipantDto,
  ) {
    return this.updateCommunicationParticipantUseCase.execute(
      conversationId,
      participantId,
      dto,
    );
  }

  @Delete('conversations/:conversationId/participants/:participantId')
  @RequiredPermissions('communication.participants.manage')
  removeParticipant(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
  ) {
    return this.removeCommunicationParticipantUseCase.execute(
      conversationId,
      participantId,
    );
  }

  @Post('conversations/:conversationId/leave')
  @RequiredPermissions('communication.conversations.view')
  leaveConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.leaveCommunicationConversationUseCase.execute(conversationId);
  }

  @Post('conversations/:conversationId/participants/:participantId/promote')
  @RequiredPermissions('communication.participants.manage')
  promoteParticipant(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Body() dto: PromoteCommunicationParticipantDto,
  ) {
    return this.promoteCommunicationParticipantUseCase.execute(
      conversationId,
      participantId,
      dto,
    );
  }

  @Post('conversations/:conversationId/participants/:participantId/demote')
  @RequiredPermissions('communication.participants.manage')
  demoteParticipant(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Body() dto: DemoteCommunicationParticipantDto,
  ) {
    return this.demoteCommunicationParticipantUseCase.execute(
      conversationId,
      participantId,
      dto,
    );
  }

  @Get('conversations/:conversationId/invites')
  @RequiredPermissions('communication.participants.manage')
  listInvites(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.listCommunicationInvitesUseCase.execute(conversationId);
  }

  @Post('conversations/:conversationId/invites')
  @RequiredPermissions('communication.participants.manage')
  createInvite(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: CreateCommunicationInviteDto,
  ) {
    return this.createCommunicationInviteUseCase.execute(conversationId, dto);
  }

  @Post('conversation-invites/:inviteId/accept')
  @RequiredPermissions('communication.conversations.view')
  acceptInvite(@Param('inviteId', new ParseUUIDPipe()) inviteId: string) {
    return this.acceptCommunicationInviteUseCase.execute(inviteId);
  }

  @Post('conversation-invites/:inviteId/reject')
  @RequiredPermissions('communication.conversations.view')
  rejectInvite(
    @Param('inviteId', new ParseUUIDPipe()) inviteId: string,
    @Body() dto: RejectCommunicationInviteDto,
  ) {
    return this.rejectCommunicationInviteUseCase.execute(inviteId, dto);
  }

  @Get('conversations/:conversationId/join-requests')
  @RequiredPermissions('communication.participants.manage')
  listJoinRequests(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.listCommunicationJoinRequestsUseCase.execute(conversationId);
  }

  @Post('conversations/:conversationId/join-requests')
  @RequiredPermissions('communication.conversations.view')
  createJoinRequest(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: CreateCommunicationJoinRequestDto,
  ) {
    return this.createCommunicationJoinRequestUseCase.execute(
      conversationId,
      dto,
    );
  }

  @Post('join-requests/:requestId/approve')
  @RequiredPermissions('communication.participants.manage')
  approveJoinRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ApproveCommunicationJoinRequestDto,
  ) {
    return this.approveCommunicationJoinRequestUseCase.execute(requestId, dto);
  }

  @Post('join-requests/:requestId/reject')
  @RequiredPermissions('communication.participants.manage')
  rejectJoinRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: RejectCommunicationJoinRequestDto,
  ) {
    return this.rejectCommunicationJoinRequestUseCase.execute(requestId, dto);
  }
}
