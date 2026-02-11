import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "dashboard": "Dashboard",
      "pos": "POS",
      "customers": "Customers",
      "inventory": "Inventory",
      "sync_status": "Sync Status",
      "todays_sales": "Today's Sales",
      "active_register": "Active Register",
      "recent_transactions": "Recent Transactions",
      "status": "Status",
      "online": "Online",
      "no_transactions": "No recent transactions to display.",
      "add_customer": "Add Customer",
      "name": "Name",
      "phone": "Phone",
      "email": "Email",
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit",
      "actions": "Actions",
      "settings": "Settings",
      "dark_mode": "Dark Mode",
      "light_mode": "Light Mode",
      "language": "Language",
      "english": "English",
      "arabic": "Arabic",
      "login": "Login",
      "username": "Username",
      "password": "Password",
      "sign_in": "Sign In",
      "logout": "Logout",
      "register": "Register",
      "create_account": "Create Account",
      "forgot_password": "Forgot Password?",
      "first_name": "First Name",
      "last_name": "Last Name",
      "already_have_account": "Already have an account? Sign in",
      "dont_have_account": "Don't have an account? Sign up",
      "reset_password": "Reset Password",
      "send_reset_link": "Send Reset Link",
      "back_to_login": "Back to Login"
      ,"invoice_total": "Invoice Total"
      ,"payment_amount": "Payment Amount"
      ,"payment_percentage": "Payment Percentage"
      ,"record_payment": "Record Payment"
      ,"amount_paid": "Amount Paid"
      ,"remaining_balance": "Remaining Balance"
      ,"payment": "Payment"
      ,"price": "Price"
      ,"stock_status": "Stock Status"
      ,"sync_title": "Sync Center"
      ,"sync_cashier_ready": "Cashier sync is active. Keep this page open when troubleshooting delayed receipts."
      ,"sync_cashier_setup_required": "Sync is paused. Ask a manager to verify device, branch, and cashier session settings."
      ,"sync_pending_outbox": "Pending outbox events"
      ,"sync_outbox_pending_action": "Pending events need upload"
      ,"sync_outbox_clear": "All queued events uploaded"
      ,"sync_last_push": "Last successful push"
      ,"sync_last_pull": "Last successful pull"
      ,"sync_server_cursor": "Current server cursor"
      ,"sync_push_now": "Retry pending push"
      ,"sync_failed_events": "Failed events"
      ,"sync_no_failed_events": "No failures"
      ,"sync_retry_action": "Mark retried"
      ,"sync_failed_reason_label": "Reason"
      ,"sync_failed_at_label": "Failed at"
      ,"sync_actionable_status_message": "No failed events. If receipts are delayed, tap \"Retry pending push\" and ask the cashier to stay online."
      ,"sync_nav_attention": "Action needed"
      ,"sync_nav_running": "Running"
      ,"smart_customer_search": "Smart customer search"
      ,"pos_customer_search_placeholder": "Type phone number or customer name"
      ,"select_customer": "Assign"
      ,"clear_selected_customer": "Clear selected customer"
      ,"no_customers_matched_search": "No customers matched your search"
      ,"unnamed_customer": "Unnamed customer"
      ,"no_phone": "No phone"
      ,"invoice_payload_customer_hint": "Selected customer ID"
      ,"none": "None"
      ,"pos_receipts_open": "Receipts History"
      ,"pos_receipts_history": "Receipts & History"
      ,"pos_receipts_quick_filter": "Quick filter"
      ,"pos_receipts_quick_filter_placeholder": "Receipt # or customer phone"
      ,"pos_receipts_loading": "Loading receipts..."
      ,"pos_receipts_empty": "No receipts matched"
      ,"pos_receipts_load_error": "Failed to load receipts"
      ,"pos_receipt_number": "Receipt #"
      ,"pos_receipt_datetime": "Date/Time"
      ,"pos_receipt_cashier": "Cashier"
      ,"pos_receipt_customer": "Customer"
      ,"pos_receipt_line_items": "Line items"
      ,"pos_receipt_totals": "Total"
      ,"pos_receipt_discount": "Discount"
      ,"pos_receipt_tax": "Tax"
      ,"pos_receipt_balance": "Balance"
      ,"pos_receipt_payment_methods": "Payment methods"
      ,"pos_receipt_returns": "Returns"
      ,"pos_open_receipt_details": "Open receipt details"
      ,"pos_receipt_details": "Receipt details"
    }
  },
  ar: {
    translation: {
      "dashboard": "لوحة التحكم",
      "pos": "نقطة البيع",
      "customers": "العملاء",
      "inventory": "المخزون",
      "sync_status": "حالة المزامنة",
      "todays_sales": "مبيعات اليوم",
      "active_register": "الكاشير النشط",
      "recent_transactions": "المعاملات الأخيرة",
      "status": "الحالة",
      "online": "متصل",
      "no_transactions": "لا توجد معاملات حديثة للعرض.",
      "add_customer": "إضافة عميل",
      "name": "الاسم",
      "phone": "الهاتف",
      "email": "البريد الإلكتروني",
      "save": "حفظ",
      "cancel": "إلغاء",
      "delete": "حذف",
      "edit": "تعديل",
      "actions": "إجراءات",
      "settings": "الإعدادات",
      "dark_mode": "الوضع الداكن",
      "light_mode": "الوضع الفاتح",
      "language": "اللغة",
      "english": "الإنجليزية",
      "arabic": "العربية",
      "login": "تسجيل الدخول",
      "username": "اسم المستخدم",
      "password": "كلمة المرور",
      "sign_in": "دخول",
      "logout": "تسجيل خروج",
      "register": "تسجيل جديد",
      "create_account": "إنشاء حساب",
      "forgot_password": "نسيت كلمة المرور؟",
      "first_name": "الاسم الأول",
      "last_name": "الاسم الأخير",
      "already_have_account": "لديك حساب بالفعل؟ تسجيل الدخول",
      "dont_have_account": "ليس لديك حساب؟ إنشاء حساب",
      "reset_password": "إعادة تعيين كلمة المرور",
      "send_reset_link": "إرسال رابط إعادة التعيين",
      "back_to_login": "العودة لتسجيل الدخول"
      ,"invoice_total": "إجمالي الفاتورة"
      ,"payment_amount": "قيمة الدفع"
      ,"payment_percentage": "نسبة الدفع"
      ,"record_payment": "تسجيل الدفعة"
      ,"amount_paid": "المبلغ المدفوع"
      ,"remaining_balance": "الرصيد المتبقي"
      ,"payment": "دفعة"
      ,"price": "السعر"
      ,"stock_status": "حالة المخزون"
      ,"sync_title": "مركز المزامنة"
      ,"sync_cashier_ready": "مزامنة الكاشير تعمل الآن. اترك هذه الصفحة مفتوحة عند معالجة تأخر الإيصالات."
      ,"sync_cashier_setup_required": "المزامنة متوقفة. اطلب من المدير التحقق من إعدادات الجهاز والفرع وجلسة الكاشير."
      ,"sync_pending_outbox": "الأحداث المعلقة في الصندوق الصادر"
      ,"sync_outbox_pending_action": "هناك أحداث بانتظار الرفع"
      ,"sync_outbox_clear": "تم رفع جميع الأحداث"
      ,"sync_last_push": "آخر رفع ناجح"
      ,"sync_last_pull": "آخر سحب ناجح"
      ,"sync_server_cursor": "مؤشر الخادم الحالي"
      ,"sync_push_now": "إعادة محاولة الرفع"
      ,"sync_failed_events": "الأحداث الفاشلة"
      ,"sync_no_failed_events": "لا توجد إخفاقات"
      ,"sync_retry_action": "تمت إعادة المحاولة"
      ,"sync_failed_reason_label": "السبب"
      ,"sync_failed_at_label": "وقت الفشل"
      ,"sync_actionable_status_message": "لا توجد أحداث فاشلة. إذا تأخرت الإيصالات، اضغط \"إعادة محاولة الرفع\" وتأكد من بقاء الكاشير متصلاً."
      ,"sync_nav_attention": "يتطلب إجراء"
      ,"sync_nav_running": "يعمل"
      ,"smart_customer_search": "بحث ذكي عن العميل"
      ,"pos_customer_search_placeholder": "اكتب رقم الهاتف أو اسم العميل"
      ,"select_customer": "تعيين"
      ,"clear_selected_customer": "مسح العميل المحدد"
      ,"no_customers_matched_search": "لا يوجد عملاء مطابقون لبحثك"
      ,"unnamed_customer": "عميل بدون اسم"
      ,"no_phone": "بدون هاتف"
      ,"invoice_payload_customer_hint": "معرّف العميل المحدد"
      ,"none": "لا يوجد"
      ,"pos_receipts_open": "سجل الإيصالات"
      ,"pos_receipts_history": "الإيصالات والسجل"
      ,"pos_receipts_quick_filter": "تصفية سريعة"
      ,"pos_receipts_quick_filter_placeholder": "رقم الإيصال أو هاتف العميل"
      ,"pos_receipts_loading": "جارٍ تحميل الإيصالات..."
      ,"pos_receipts_empty": "لا توجد إيصالات مطابقة"
      ,"pos_receipts_load_error": "تعذر تحميل الإيصالات"
      ,"pos_receipt_number": "رقم الإيصال"
      ,"pos_receipt_datetime": "التاريخ/الوقت"
      ,"pos_receipt_cashier": "الكاشير"
      ,"pos_receipt_customer": "العميل"
      ,"pos_receipt_line_items": "بنود الفاتورة"
      ,"pos_receipt_totals": "الإجمالي"
      ,"pos_receipt_discount": "الخصم"
      ,"pos_receipt_tax": "الضريبة"
      ,"pos_receipt_balance": "الرصيد"
      ,"pos_receipt_payment_methods": "طرق الدفع"
      ,"pos_receipt_returns": "المرتجعات"
      ,"pos_open_receipt_details": "فتح تفاصيل الإيصال"
      ,"pos_receipt_details": "تفاصيل الإيصال"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
