import { EnrollmentResponseDto } from '../../../students/enrollments/dto/enrollment.dto';
import {
  CreateSchoolRegistrationDto,
  SchoolRegistrationResponseDto,
} from '../../../students/registration/dto/school-registration.dto';
import { StudentResponseDto } from '../../../students/students/dto/student.dto';

export class RegisterAcceptedApplicationDto extends CreateSchoolRegistrationDto {}

export class ApplicationRegistrationSubmitExistingSummaryDto {
  student!: StudentResponseDto;
  enrollment!: EnrollmentResponseDto | null;
}

export class ApplicationRegistrationSubmitResponseDto {
  applicationId!: string;
  registered!: boolean;
  alreadyRegistered!: boolean;
  registration!:
    | SchoolRegistrationResponseDto
    | ApplicationRegistrationSubmitExistingSummaryDto;
  warnings!: string[];
}
