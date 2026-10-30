/**
 * تشخيص أحداث سجل التتبع بلغة واضحة:
 * ماذا حدث — لماذا — ما الحل — ونوع المشكلة.
 * يعمل في الخادم والمتصفح (بدون أي اعتماد على قاعدة البيانات).
 */

export type Kind = 'ok' | 'user' | 'config' | 'system' | 'security' | 'access';

export const KIND: Record<Kind, { label: string; hint: string; tone: string; dot: string }> = {
  ok:       { label: 'عملية عادية',   hint: 'لا يحتاج أي إجراء',                       tone: 'bg-surface text-ink-soft',    dot: 'bg-ink-faint' },
  user:     { label: 'خطأ مستخدم',    hint: 'المستخدم أدخل شيئاً غير صحيح والنظام منعه', tone: 'bg-amber-soft text-amber',    dot: 'bg-amber' },
  config:   { label: 'إعداد ناقص',    hint: 'يحتاج تعديلاً من الإدارة في الإعدادات',      tone: 'bg-peri-soft text-peri-deep', dot: 'bg-peri' },
  access:   { label: 'صلاحية',        hint: 'حساب موقوف أو إسناد غير موجود',             tone: 'bg-lilac-tile text-ink-soft', dot: 'bg-ink-muted' },
  system:   { label: 'خطأ تقني',      hint: 'مشكلة حقيقية في النظام — تحتاج المطوّر',     tone: 'bg-rose-soft text-rose',      dot: 'bg-rose' },
  security: { label: 'تنبيه أمني',    hint: 'محاولة غير مصرّح بها أو مشبوهة',            tone: 'bg-black text-white',         dot: 'bg-black' },
};

export interface LogLike {
  action: string;
  severity: string;
  actor_name: string | null;
  details: Record<string, unknown>;
}

export interface Diagnosis {
  kind: Kind;
  /** جملة تصف ما حدث (تتضمن اسم الشخص إن وُجد) */
  title: string;
  /** عنوان عام لتجميع المشاكل المتشابهة (بدون اسم الشخص) */
  group: string;
  /** مفتاح التجميع */
  key: string;
  cause?: string;
  fix?: string;
  /** هل يحتاج تدخل الإدارة؟ */
  needsAction: boolean;
}

/** أسماء العمليات */
const OP: Record<string, string> = {
  'sheet.save': 'حفظ كشف درجات', 'sheet.load': 'فتح كشف', 'sheet.add_student': 'إضافة طالب للكشف', 'sheet.exclude': 'استبعاد طالب',
  'sheet.restore': 'إعادة طالب للكشف', 'pool.load': 'عرض طلاب الصف', 'pool.claim': 'ضم طلاب للشعبة', 'pool.release': 'إرجاع طالب لقائمة الصف',
  'request.create': 'رفع طلب', 'request.review': 'مراجعة طلب', 'request.cancel': 'إلغاء طلب',
  'account.create': 'إنشاء حساب', 'account.bulk_create': 'إنشاء حسابات دفعة', 'account.reset_password': 'إعادة تعيين كلمة مرور',
  'account.change_username': 'تغيير اسم مستخدم', 'account.update': 'تعديل حساب', 'account.set_active': 'إيقاف/تفعيل حساب', 'account.delete': 'حذف حساب',
  'account.export_credentials': 'تصدير بيانات الدخول',
  'assignment.add': 'إسناد مواد', 'assignment.remove': 'إزالة إسناد', 'assignment.transfer': 'نقل إسنادات',
  'student.save': 'حفظ بيانات طالب', 'student.import': 'استيراد الطلاب', 'student.import_preview': 'معاينة ملف الطلاب', 'student.move': 'نقل طلاب لشعبة',
  'student.set_active': 'إيقاف/تفعيل طلاب', 'student.approve': 'اعتماد بيانات طلاب', 'student.delete': 'حذف طلاب',
  'review.resolve': 'قرار مراجعة طالب', 'review.approve_all': 'اعتماد كل الطلاب المضافين',
  'settings.update': 'تعديل الإعدادات', 'branch.save': 'حفظ فرع', 'branch.delete': 'حذف فرع', 'branch.grades': 'تحديد صفوف الفرع',
  'grade.save': 'حفظ صف', 'grade.delete': 'حذف صف', 'section.add': 'إضافة شعب', 'section.delete': 'حذف شعبة', 'section.rename': 'تعديل اسم شعبة',
  'section.general': 'إنشاء شعب «عام»', 'verbal.save': 'حفظ مستويات الرصد اللفظي', 'subject.save': 'حفظ مادة', 'subject.delete': 'حذف مادة',
  'subject.link': 'ربط مواد بصفوف', 'subject.unlink': 'فصل مادة عن صف', 'components.save': 'حفظ أنواع التقييم', 'subject.branch_toggle': 'تفعيل مادة لفرع',
};

/** أسماء الصفحات */
const PAGES: Record<string, string> = {
  '/': 'الرئيسية', '/grading': 'رصد الدرجات', '/records': 'سجلات الرصد', '/requests': 'الطلبات', '/account': 'حسابي',
  '/results': 'نتائج الرصد', '/accounts': 'الحسابات', '/assignments': 'الإسناد', '/students': 'الطلاب', '/logs': 'سجل التتبع',
  '/settings': 'الإعدادات العامة', '/settings/branches': 'الفروع', '/settings/structure': 'الصفوف والشعب', '/settings/subjects': 'المواد والتقييم',
  '/api/export': 'تصدير إكسل',
};

/** العمليات الناجحة المسجّلة */
const DONE: Record<string, string> = {
  'auth.login': 'تسجيل دخول', 'auth.logout': 'تسجيل خروج', 'auth.password_changed': 'تغيير كلمة المرور',
  'grade.submit': 'حفظ كشف لأول مرة', 'grade.edit': 'تعديل كشف محفوظ',
  'student.add': 'إضافة طالب جديد للكشف', 'student.exclude': 'استبعاد طالب من كشف مادة', 'student.restore': 'إعادة طالب للكشف',
  'student.claim': 'ضم طلاب للشعبة', 'student.release': 'إرجاع طالب لقائمة الصف',
  'request.create': 'رفع طلب', 'request.approve': 'قبول طلب', 'request.reject': 'رفض طلب', 'request.cancel': 'إلغاء طلب',
  'account.create': 'إنشاء حساب', 'account.reset_password': 'إعادة تعيين كلمة مرور', 'account.change_username': 'تغيير اسم مستخدم',
  'account.update': 'تعديل حساب', 'account.activate': 'تفعيل حساب', 'account.deactivate': 'إيقاف حساب', 'account.delete': 'حذف حساب',
  'settings.update': 'تعديل الإعدادات العامة', 'student.import': 'استيراد الطلاب', 'export.template': 'تحميل نموذج الاستيراد',
  'review.approve': 'اعتماد/موافقة في مراجعة الطلاب', 'review.move': 'نقل طالب مُرجَع لشعبته', 'review.keep': 'إبقاء طالب بدون شعبة',
  'review.restore': 'إعادة طالب مستبعد للكشف', 'review.deactivate': 'إيقاف طالب من المراجعة',
  'export.section': 'تصدير كشف شعبة', 'export.subject': 'تصدير كشف مادة', 'export.branch': 'تصدير كشوفات فرع', 'export.progress': 'تصدير تقرير متابعة الرصد',
};

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function diagnose(l: LogLike, contextText?: string): Diagnosis {
  const d = l.details ?? {};
  const who = l.actor_name ?? (d.username ? `«${str(d.username)}»` : 'زائر');
  const where = contextText ? ` (${contextText})` : '';
  const msg = str(d.message);
  const hint = str(d.hint);
  const code = str(d.code);
  const a = l.action;
  const base = a.replace(/\.(failed|rejected|forbidden)$/, '');
  const op = OP[base] ?? base;

  // ------------------------------------------------------------ الدخول
  if (a === 'auth.login_failed') {
    const reason = str(d.reason);
    const attempt = Number(d.attempt) || 0;
    if (reason === 'unknown_user') return {
      kind: 'user', key: 'login:unknown', needsAction: false,
      title: `دخول باسم مستخدم غير موجود — ${who}`, group: 'دخول باسم مستخدم غير موجود',
      cause: 'اسم المستخدم مكتوب خطأ (حرف زائد، مسافة، أو أحرف عربية/كبيرة)، أو الحساب لم يُنشأ بعد.',
      fix: 'تأكدي أن المعلمة تكتب اسم المستخدم كما في ورقة بيانات الدخول، بالإنجليزي الصغير. إذا لم يكن لها حساب أنشئيه من «الحسابات».',
    };
    return {
      kind: 'user', key: 'login:password', needsAction: attempt >= 3,
      title: `كلمة مرور خاطئة — ${who}${attempt > 1 ? ` (المحاولة ${attempt})` : ''}`, group: 'كلمة مرور خاطئة عند الدخول',
      cause: 'كلمة المرور غير صحيحة. غالباً نسيتها أو تكتبها بلغة لوحة مفاتيح مختلفة.',
      fix: 'إذا نسيتها: الحسابات ← ⋮ ← إعادة تعيين كلمة المرور. بعد 5 محاولات خاطئة يُوقف الدخول 15 دقيقة تلقائياً.',
    };
  }
  if (a === 'auth.login_blocked') return {
    kind: 'security', key: 'login:blocked', needsAction: true,
    title: `إيقاف الدخول مؤقتاً بعد 5 محاولات خاطئة — ${who}`, group: 'إيقاف مؤقت بعد محاولات دخول متكررة',
    cause: 'محاولات متتالية بكلمة مرور خاطئة خلال 15 دقيقة. إما أن المستخدم نسيها، أو شخص آخر يحاول تخمينها.',
    fix: 'اسألي صاحبة الحساب: إن كانت هي فأعيدي تعيين كلمة المرور. وإن لم تكن هي فغيّري كلمة المرور فوراً وراجعي عنوان IP في التفاصيل.',
  };
  if (a === 'auth.login_inactive') return {
    kind: 'access', key: 'login:inactive', needsAction: true,
    title: `محاولة دخول بحساب موقوف — ${who}`, group: 'دخول بحساب موقوف',
    cause: 'الحساب موقوف من الإدارة.',
    fix: 'إذا كان الإيقاف بالخطأ: الحسابات ← ⋮ ← تفعيل الحساب.',
  };
  if (a === 'auth.password_change_failed') return {
    kind: 'user', key: 'pw:change', needsAction: false,
    title: `كلمة المرور الحالية خاطئة عند تغييرها — ${who}`, group: 'كلمة مرور حالية خاطئة عند التغيير',
    cause: 'لتغيير كلمة المرور يجب إدخال الحالية بشكل صحيح.', fix: 'إذا نسيتها أعيدي تعيينها من «الحسابات».',
  };

  // ------------------------------------------------------------ صفحات وأخطاء الواجهة
  if (a === 'page.forbidden') return {
    kind: 'security', key: 'page:forbidden', needsAction: false,
    title: `فتح صفحة غير مسموحة${d.path ? ` (${str(d.path)})` : ''} — ${who}`, group: 'فتح صفحة غير مصرّح بها',
    cause: 'كتب الرابط يدوياً أو فتح رابطاً محفوظاً من صلاحية سابقة. النظام منعه وأعاده للرئيسية.',
    fix: 'غالباً غير مقصود. إذا تكرر كثيراً من نفس الشخص فراجعيه.',
  };
  if (a === 'client.ui.error' || a === 'client.page.error') return {
    kind: 'system', key: `ui:${msg.slice(0, 60)}`, needsAction: true,
    title: `خطأ تقني في الواجهة${d.path ? ` (${str(d.path)})` : ''} — ${who}`, group: `خطأ تقني في الواجهة: ${msg.slice(0, 70) || 'غير معروف'}`,
    cause: msg ? `رسالة الخطأ: ${msg}` : 'خطأ غير متوقع في المتصفح.',
    fix: 'اطلبي من المستخدم تحديث الصفحة. إذا تكرر أرسلي هذا الحدث (رمز العملية والرسالة) للمطوّر.',
  };
  if (a === 'server.error') {
    const path = str(d.path);
    const page = PAGES[path.split('?')[0]] ?? path;
    const rel = /could not find a relationship|PGRST200|more than one relationship|PGRST201/i.test(msg + code);
    const perm = /permission denied|42501/i.test(msg + code);
    const col = /column .* does not exist|42703|function .* does not exist|42883|relation .* does not exist|42P01/i.test(msg + code);
    return {
      kind: 'system', key: `server:${rel ? 'rel' : perm ? 'perm' : col ? 'schema' : (str(d.route) || path)}`, needsAction: true,
      title: `تعذّر فتح «${page}» — ${who}`, group: rel || col ? 'تعذّر فتح صفحة: قاعدة البيانات تحتاج تحديثاً' : `تعذّر فتح «${page}»`,
      cause: rel ? 'خلل في الربط بين جداول قاعدة البيانات (رابط ناقص بين جدولين).'
        : col ? 'قاعدة البيانات أقدم من نسخة الموقع: عمود أو دالة غير موجودة.'
        : perm ? 'رفضت قاعدة البيانات القراءة لهذا المستخدم (صلاحيات).'
        : msg ? `رسالة الخادم: ${msg}` : 'خطأ غير متوقع في الخادم.',
      fix: rel || col ? 'غالباً لم يُشغَّل آخر ملف تحديث (migrations) في Supabase ← SQL Editor. شغّليه ثم أعيدي فتح الصفحة.'
        : 'ليس خطأ المستخدم. أرسلي للمطوّر رمز العملية والرسالة من «التفاصيل التقنية».',
    };
  }
  if (a === 'export.failed') return {
    kind: 'system', key: 'export:failed', needsAction: true,
    title: `فشل تصدير ملف إكسل — ${who}`, group: 'فشل التصدير',
    cause: msg || 'خطأ أثناء إنشاء الملف.', fix: 'أعيدي المحاولة؛ إذا تكرر أرسليه للمطوّر.',
  };

  // ------------------------------------------------------------ غير مصرّح
  if (a.endsWith('.forbidden') || hint === 'FORBIDDEN' || code === '42501') {
    const sheet = base.startsWith('sheet') || base.startsWith('pool');
    return {
      kind: 'security', key: `forbidden:${base}`, needsAction: !sheet,
      title: `«${op}» بدون صلاحية — ${who}${where}`, group: `محاولة «${op}» بدون صلاحية`,
      cause: sheet
        ? 'الكشف أو الشعبة غير مسندة لهذه المعلمة — غالباً أُزيل إسنادها أثناء فتحها للكشف، أو فتحت رابطاً قديماً.'
        : 'المستخدم لا يملك صلاحية هذه العملية، والنظام رفضها.',
      fix: sheet ? 'راجعي «الإسناد» لهذه المعلمة. إذا كان الإسناد صحيحاً ويتكرر فقد تكون محاولة متعمدة.' : 'إذا تكرر من نفس الشخص فراجعيه.',
    };
  }

  // ------------------------------------------------------------ فشل برسالة من قاعدة البيانات
  if (a.endsWith('.failed') && (code === 'PGRST301' || /jwt expired|session.*(expired|missing)|refresh token/i.test(msg))) {
    return { kind: 'user', key: 'auth:expired', needsAction: false,
      title: `انتهاء الجلسة أثناء «${op}» — ${who}${where}`, group: 'انتهاء الجلسة أثناء العمل',
      cause: 'بقيت الصفحة مفتوحة فترة طويلة فانتهت صلاحية الدخول.', fix: 'يكفي تحديث الصفحة أو تسجيل الدخول مرة أخرى — ما رُصد ولم يُحفظ يبقى كمسودة على نفس الجهاز.' };
  }
  if (a.endsWith('.failed')) {
    switch (hint) {
      case 'CLOSED': return { kind: 'config', key: 'grade:closed', needsAction: true,
        title: `محاولة رصد والرصد مغلق — ${who}${where}`, group: 'محاولة رصد والرصد مغلق',
        cause: 'الرصد مغلق من «الإعدادات العامة»، فلا تستطيع أي معلمة الحفظ.',
        fix: 'إذا حان وقت الرصد: الإعدادات العامة ← فعّلي «الرصد مفتوح».' };
      case 'TERM': return { kind: 'config', key: 'grade:term', needsAction: true,
        title: `رصد لترم غير الحالي — ${who}${where}`, group: 'رصد لترم غير الحالي',
        cause: 'الكشف المفتوح لترم يختلف عن «الترم الحالي» في الإعدادات (غالباً تغيّر الترم والمعلمة فاتحة الصفحة).',
        fix: 'تأكدي من «الترم الحالي» في الإعدادات العامة، واطلبي من المعلمة تحديث الصفحة.' };
      case 'OVER_MAX': return { kind: 'user', key: 'grade:overmax', needsAction: false,
        title: `درجة أعلى من العظمى — ${who}${where}`, group: 'درجة أعلى من العظمى',
        cause: msg, fix: 'النظام منع الحفظ ونبّه المعلمة. إذا كانت الدرجة العظمى نفسها خاطئة عدّليها من «المواد والتقييم».' };
      case 'INCOMPLETE': return { kind: 'user', key: 'grade:incomplete', needsAction: false,
        title: `محاولة حفظ كشف غير مكتمل — ${who}${where}`, group: 'حفظ كشف غير مكتمل',
        cause: msg || 'بعض الطلاب بلا درجة.',
        fix: 'يجب رصد كل الطلاب (صفر يُكتب 0 والغائب «غ»). إذا كان في الكشف طالب ليس من الشعبة تُرجعه المعلمة لقائمة الصف.' };
      case 'LOCKED': return { kind: 'user', key: 'grade:locked', needsAction: false,
        title: `تعديل كشف بعد انتهاء مدة التعديل — ${who}${where}`, group: 'تعديل كشف مقفل',
        cause: msg, fix: 'على المعلمة رفع «طلب فتح»، ثم تقبلينه من صفحة «الطلبات».' };
      case 'CONFIG': return { kind: 'config', key: 'grade:config', needsAction: true,
        title: `تعذّر الحفظ: الدرجة العظمى غير محددة — ${who}${where}`, group: 'درجة عظمى غير محددة لمادة',
        cause: msg, fix: 'المواد والتقييم ← اختاري الصف ← «التقييم» للمادة ← حددي الدرجة العظمى لكل نوع.' };
      case 'DUPLICATE': return { kind: 'user', key: `dup:${base}`, needsAction: false,
        title: `${msg || 'بيانات مكررة'} — ${who}`, group: `بيانات مكررة عند «${op}»`, cause: msg, fix: 'النظام منع التكرار — لا يلزم إجراء.' };
      case 'AUTH': return { kind: 'user', key: 'auth:expired', needsAction: false,
        title: `انتهاء الجلسة — ${who}`, group: 'انتهاء الجلسة', cause: 'بقيت الصفحة مفتوحة فترة طويلة.', fix: 'يكفي تسجيل الدخول مرة أخرى.' };
      case 'INVALID': case 'EMPTY': case 'NOT_FOUND': case 'DONE':
        return { kind: 'user', key: `invalid:${base}:${msg.slice(0, 40)}`, needsAction: false,
          title: `${msg || `تعذّر «${op}»`} — ${who}${where}`, group: `«${op}»: ${msg.slice(0, 60) || 'بيانات غير صحيحة'}`,
          cause: msg, fix: 'رسالة تحقق طبيعية ظهرت للمستخدم — لا يلزم إجراء إلا إذا تكررت كثيراً.' };
    }
    if (code === '23505') return { kind: 'user', key: `dup:${base}`, needsAction: false,
      title: `بيانات مكررة عند «${op}» — ${who}`, group: `بيانات مكررة عند «${op}»`, cause: 'القيمة مسجّلة مسبقاً (اسم أو رقم مكرر).', fix: 'لا يلزم إجراء.' };
    if (code === '23503') return { kind: 'user', key: `fk:${base}`, needsAction: false,
      title: `لا يمكن «${op}» لوجود بيانات مرتبطة — ${who}`, group: `«${op}» مرفوض لوجود بيانات مرتبطة`,
      cause: 'العنصر مرتبط ببيانات أخرى (طلاب، رصد، حسابات).', fix: 'احذفي أو انقلي البيانات المرتبطة أولاً، أو استخدمي «إيقاف» بدل الحذف.' };
    return { kind: 'system', key: `sys:${base}:${code || msg.slice(0, 40)}`, needsAction: true,
      title: `خطأ تقني أثناء «${op}» — ${who}${where}`, group: `خطأ تقني أثناء «${op}»`,
      cause: msg ? `رسالة النظام: ${msg}` : 'خطأ غير متوقع من قاعدة البيانات.',
      fix: 'هذا ليس خطأ المستخدم. أعيدي المحاولة؛ إذا تكرر أرسلي رمز العملية والرسالة للمطوّر.' };
  }

  // ------------------------------------------------------------ رفض من التحقق
  if (a.endsWith('.rejected')) {
    const isConfig = /أضيفي|حددي الفرع|لا توجد شعب|غير مربوطة|حدد/.test(msg) && !/اسم|كلمة المرور/.test(msg);
    return {
      kind: isConfig ? 'config' : 'user', key: `rej:${base}:${msg.slice(0, 50)}`, needsAction: isConfig,
      title: `${msg || `رُفض «${op}»`} — ${who}${where}`, group: `«${op}»: ${msg.slice(0, 70)}`,
      cause: `النظام رفض «${op}» وأظهر للمستخدم: ${msg}`,
      fix: isConfig ? 'يحتاج إكمال الإعداد المذكور في الرسالة.' : 'إدخال غير صحيح من المستخدم ومنعه النظام — لا يلزم إجراء إلا إذا تكرر.',
    };
  }

  // ------------------------------------------------------------ عمليات ناجحة
  const done = DONE[a];
  if (done) {
    const extra = a === 'student.claim' && d.claimed != null ? ` (${str(d.claimed)} طالب)` :
      a === 'student.import' && d.imported != null ? ` (${str(d.imported)} طالب)` :
      a.startsWith('grade.') && d.component ? ` (${str(d.component)})` : '';
    return { kind: 'ok', key: `ok:${a}`, needsAction: false, title: `${done}${extra} — ${who}${where}`, group: done };
  }
  return { kind: l.severity === 'error' ? 'system' : l.severity === 'security' ? 'security' : 'ok', key: `other:${a}`, needsAction: l.severity === 'error',
    title: `${OP[a] ?? a} — ${who}${where}`, group: OP[a] ?? a };
}
