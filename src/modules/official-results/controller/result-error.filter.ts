import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request } from 'express';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { GlobalExceptionFilter } from '../../../common/exceptions/global-exception.filter';
import { OfficialResultsError } from '../domain/official-results.error';

const ar: Record<string, string> = {
  'export.not_ready': 'ملف النتائج غير جاهز للتنزيل',
  'export.expired': 'انتهت صلاحية تصدير النتائج',
  'export.format_disabled': 'صيغة تصدير النتائج غير متاحة لهذا النطاق',
  'cell.invalid_value': 'القيمة غير صالحة لحقل النتيجة',
  'schema.invalid': 'تعريف كشف النتائج المقترح غير صالح',
  'schema.stale': 'تغيّر تعريف كشف النتائج',
  'schema.protected': 'العملية المقترحة تغيّر قواعد حماية بيانات النتائج',
  'template.archived': 'قالب النتائج مؤرشف',
  'preview.stale': 'تغيّرت البيانات منذ المعاينة. أعد المعاينة قبل التأكيد',
  'period.invalid_dates':
    'يجب أن تقع تواريخ التقرير ضمن السنة والفصل الدراسي المحددين',
  'period.closed': 'فترة النتائج مغلقة أمام الإدخال',
  'period.duplicate_code': 'يوجد رمز الفترة بالفعل في السنة الدراسية',
  'period.used_dates': 'ترتبط التواريخ بكشف قائم أو بفترة مغلقة',
  'group.invalid_subject': 'المادة لا تتوافق مع مجموعة النتائج',
  'group.duplicate': 'توجد مجموعة نتائج تستخدم الرمز أو المادة بالفعل',
  'scope.subject_unavailable': 'المادة غير متاحة لهذا الصف والفصل الدراسي',
  'scope.conflict': 'توجد قواعد نطاق متعارضة لهذا الهدف',
  'scope.limit_exceeded': 'يتجاوز النطاق حدود العملية',
  'roster.ambiguous': 'يوجد أكثر من تسجيل صالح في تاريخ الكشف',
  'roster.changed': 'راجع تسجيل الطلاب قبل إنشاء الكشف',
  'roster.limit_exceeded': 'يتجاوز الكشف العدد المدعوم من الطلاب',
  'policy.invalid': 'سياسة النتائج المقترحة غير صالحة',
  'policy.stale': 'تغيّرت السياسة أو المعاينة. حدّث الطلب وأعد المراجعة',
  'idempotency.conflict': 'مفتاح إعادة المحاولة مرتبط بطلب آخر',
  'publication.forbidden':
    'لا تسمح الصلاحيات والسياسة الحالية بنشر النتيجة المحددة',
  'review.required': 'تتطلب السياسة الحالية مراجعة المدرسة',
  'grant.invalid': 'نطاق التفويض أو إجراءاته أو فترة صلاحيته غير صالحة',
  'revision.stale': 'تغيّر سجل النتائج. حدّث النسخة قبل المتابعة',
  'correction_window.invalid': 'هدف نافذة التصحيح أو وقت انتهائها غير صالح',
};

@Catch(OfficialResultsError)
export class ResultErrorFilter implements ExceptionFilter {
  private readonly global = new GlobalExceptionFilter();

  catch(error: OfficialResultsError, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const primary = request
      .header('accept-language')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase();
    const translated =
      primary && /^ar(?:-|;|$)/u.test(primary)
        ? ar[error.code.slice('official_results.'.length)]
        : undefined;
    this.global.catch(
      translated
        ? new DomainException({
            httpStatus: error.httpStatus,
            code: error.code,
            message: translated,
            details: error.details,
          })
        : error,
      host,
    );
  }
}
