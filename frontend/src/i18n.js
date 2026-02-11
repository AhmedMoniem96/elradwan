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
      "runtime_context": "Runtime Context",
      "active_branch": "Active Branch",
      "active_device": "Active Device",
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
      ,"forgot_password_description": "Enter your email address and we'll send you a reset token."
      ,"forgot_password_email_required": "Email is required"
      ,"forgot_password_submitting": "Sending..."
      ,"forgot_password_request_error": "Unable to send reset instructions. Please try again."
      ,"forgot_password_success": "Check your email"
      ,"forgot_password_success_detail": "If an account exists for {{email}}, reset instructions were sent."
      ,"reset_password_confirm_description": "Enter the reset token and your new password to finish resetting your account."
      ,"reset_password_token": "Reset token"
      ,"reset_password_new_password": "New password"
      ,"reset_password_confirm_submit": "Set New Password"
      ,"reset_password_confirm_submitting": "Updating..."
      ,"reset_password_confirm_required_fields": "Email, token, and new password are required"
      ,"reset_password_confirm_error": "Unable to reset password. Please verify your token and try again."
      ,"reset_password_confirm_success": "Your password has been reset successfully."
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
      ,"app_title": "Elradwan POS"
      ,"reports": "Reports"
      ,"audit_logs": "Audit Logs"
      ,"branches": "Branches"
      ,"branches_add_branch": "Add Branch"
      ,"branches_edit_branch": "Edit Branch"
      ,"branches_load_error": "Failed to load branches"
      ,"branches_save_error": "Failed to save branch"
      ,"branches_toggle_status_error": "Failed to update branch status"
      ,"branches_create_success": "Branch created successfully"
      ,"branches_update_success": "Branch updated successfully"
      ,"branches_deactivate_success": "Branch deactivated successfully"
      ,"branches_reactivate_success": "Branch reactivated successfully"
      ,"branches_required_fields_error": "Code, name, and timezone are required"
      ,"branches_empty_state": "No branches found"
      ,"branches_loading": "Loading branches..."
      ,"warehouses": "Warehouses"
      ,"warehouses_add_warehouse": "Add Warehouse"
      ,"warehouses_edit_warehouse": "Edit Warehouse"
      ,"warehouses_load_error": "Failed to load warehouses"
      ,"warehouses_save_error": "Failed to save warehouse"
      ,"warehouses_delete_error": "Failed to delete warehouse"
      ,"warehouses_create_success": "Warehouse created successfully"
      ,"warehouses_update_success": "Warehouse updated successfully"
      ,"warehouses_delete_success": "Warehouse deleted successfully"
      ,"warehouses_name_required": "Warehouse name is required"
      ,"warehouses_empty_state": "No warehouses found"
      ,"warehouses_loading": "Loading warehouses..."
      ,"warehouses_primary": "Primary"
      ,"yes": "Yes"
      ,"no": "No"
      ,"deleting": "Deleting..."
      ,"code": "Code"
      ,"timezone": "Timezone"
      ,"active": "Active"
      ,"inactive": "Inactive"
      ,"deactivate": "Deactivate"
      ,"reactivate": "Reactivate"
      ,"saving": "Saving..."
      ,"add": "Add"
      ,"clear": "Clear"
      ,"cart": "Cart"
      ,"warehouse": "Warehouse"
      ,"product": "Product"
      ,"supplier": "Supplier"
      ,"on_hand": "On Hand"
      ,"minimum": "Minimum"
      ,"reorder": "Reorder"
      ,"severity": "Severity"
      ,"sku": "SKU"
      ,"reference": "Reference"
      ,"notes": "Notes"
      ,"quantity": "Quantity"
      ,"source": "Source"
      ,"destination": "Destination"
      ,"lines": "Lines"
      ,"approve": "Approve"
      ,"complete": "Complete"
      ,"export_csv": "Export CSV"
      ,"export_pdf": "Export PDF"
      ,"customers_delete_confirmation": "Are you sure you want to delete this customer?"
      ,"pos_load_products_error": "Failed to load products"
      ,"pos_intro_text": "Search products by name, SKU, or barcode, add them fast to cart, and collect flexible payments."
      ,"pos_smart_product_search": "Smart product search"
      ,"pos_product_search_placeholder": "Type product name, SKU, or barcode"
      ,"pos_category_filter_label": "Category filter"
      ,"pos_filter_products_by_category": "Filter products by this category"
      ,"pos_no_search_results": "No search results matched"
      ,"pos_cart_empty": "No items in cart yet."
      ,"pos_each": "each"
      ,"pos_search_products_group": "Products"
      ,"pos_search_categories_group": "Categories"
      ,"pos_search_customers_group": "Customers"
      ,"inventory_load_error": "Failed to load inventory data"
      ,"inventory_save_stock_status_error": "Failed to save stock status"
      ,"inventory_mark_alerts_read_error": "Failed to mark alerts read"
      ,"inventory_create_transfer_error": "Failed to create transfer"
      ,"inventory_approve_transfer_error": "Failed to approve transfer"
      ,"inventory_complete_transfer_error": "Failed to complete transfer"
      ,"inventory_low_critical_stock": "Low/Critical Stock"
      ,"inventory_critical_label": "Critical"
      ,"inventory_low_label": "Low"
      ,"inventory_unread_alerts": "Unread Alerts"
      ,"inventory_mark_all_read": "Mark all read"
      ,"inventory_alert_message": "{{product}} in {{warehouse}}: {{current}} on hand (min {{threshold}})"
      ,"inventory_no_unread_alerts": "No unread alerts."
      ,"inventory_product_stock_status": "Product Stock Status"
      ,"inventory_stock_status_placeholder": "in stock / out of stock"
      ,"inventory_create_stock_transfer": "Create Stock Transfer"
      ,"inventory_source_warehouse": "Source Warehouse"
      ,"inventory_destination_warehouse": "Destination Warehouse"
      ,"inventory_requires_supervisor_approval": "Requires supervisor approval"
      ,"inventory_add_line": "Add Line"
      ,"inventory_create_transfer": "Create Transfer"
      ,"inventory_stock_transfers": "Stock Transfers"
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
      "runtime_context": "سياق التشغيل",
      "active_branch": "الفرع النشط",
      "active_device": "الجهاز النشط",
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
      ,"forgot_password_description": "أدخل بريدك الإلكتروني وسنرسل لك رمز إعادة التعيين."
      ,"forgot_password_email_required": "البريد الإلكتروني مطلوب"
      ,"forgot_password_submitting": "جارٍ الإرسال..."
      ,"forgot_password_request_error": "تعذر إرسال تعليمات إعادة التعيين. حاول مرة أخرى."
      ,"forgot_password_success": "تحقق من بريدك الإلكتروني"
      ,"forgot_password_success_detail": "إذا كان هناك حساب مرتبط بـ {{email}} فتم إرسال تعليمات إعادة التعيين."
      ,"reset_password_confirm_description": "أدخل رمز إعادة التعيين وكلمة المرور الجديدة لإكمال العملية."
      ,"reset_password_token": "رمز إعادة التعيين"
      ,"reset_password_new_password": "كلمة المرور الجديدة"
      ,"reset_password_confirm_submit": "تعيين كلمة مرور جديدة"
      ,"reset_password_confirm_submitting": "جارٍ التحديث..."
      ,"reset_password_confirm_required_fields": "البريد الإلكتروني والرمز وكلمة المرور الجديدة مطلوبة"
      ,"reset_password_confirm_error": "تعذر إعادة تعيين كلمة المرور. يرجى التحقق من الرمز والمحاولة مرة أخرى."
      ,"reset_password_confirm_success": "تمت إعادة تعيين كلمة المرور بنجاح."
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
      ,"app_title": "نقطة بيع الرضوان"
      ,"reports": "التقارير"
      ,"audit_logs": "سجلات التدقيق"
      ,"branches": "الفروع"
      ,"branches_add_branch": "إضافة فرع"
      ,"branches_edit_branch": "تعديل الفرع"
      ,"branches_load_error": "تعذر تحميل الفروع"
      ,"branches_save_error": "تعذر حفظ الفرع"
      ,"branches_toggle_status_error": "تعذر تحديث حالة الفرع"
      ,"branches_create_success": "تم إنشاء الفرع بنجاح"
      ,"branches_update_success": "تم تحديث الفرع بنجاح"
      ,"branches_deactivate_success": "تم تعطيل الفرع بنجاح"
      ,"branches_reactivate_success": "تمت إعادة تفعيل الفرع بنجاح"
      ,"branches_required_fields_error": "رمز الفرع والاسم والمنطقة الزمنية حقول مطلوبة"
      ,"branches_empty_state": "لا توجد فروع"
      ,"branches_loading": "جارٍ تحميل الفروع..."
      ,"warehouses": "المستودعات"
      ,"warehouses_add_warehouse": "إضافة مستودع"
      ,"warehouses_edit_warehouse": "تعديل المستودع"
      ,"warehouses_load_error": "تعذر تحميل المستودعات"
      ,"warehouses_save_error": "تعذر حفظ المستودع"
      ,"warehouses_delete_error": "تعذر حذف المستودع"
      ,"warehouses_create_success": "تم إنشاء المستودع بنجاح"
      ,"warehouses_update_success": "تم تحديث المستودع بنجاح"
      ,"warehouses_delete_success": "تم حذف المستودع بنجاح"
      ,"warehouses_name_required": "اسم المستودع مطلوب"
      ,"warehouses_empty_state": "لا توجد مستودعات"
      ,"warehouses_loading": "جارٍ تحميل المستودعات..."
      ,"warehouses_primary": "أساسي"
      ,"yes": "نعم"
      ,"no": "لا"
      ,"deleting": "جارٍ الحذف..."
      ,"code": "الرمز"
      ,"timezone": "المنطقة الزمنية"
      ,"active": "نشط"
      ,"inactive": "غير نشط"
      ,"deactivate": "تعطيل"
      ,"reactivate": "إعادة تفعيل"
      ,"saving": "جارٍ الحفظ..."
      ,"add": "إضافة"
      ,"clear": "مسح"
      ,"cart": "السلة"
      ,"warehouse": "المستودع"
      ,"product": "المنتج"
      ,"supplier": "المورّد"
      ,"on_hand": "المتوفر"
      ,"minimum": "الحد الأدنى"
      ,"reorder": "إعادة الطلب"
      ,"severity": "الخطورة"
      ,"sku": "رمز المنتج"
      ,"reference": "المرجع"
      ,"notes": "ملاحظات"
      ,"quantity": "الكمية"
      ,"source": "المصدر"
      ,"destination": "الوجهة"
      ,"lines": "البنود"
      ,"approve": "اعتماد"
      ,"complete": "إكمال"
      ,"export_csv": "تصدير CSV"
      ,"export_pdf": "تصدير PDF"
      ,"customers_delete_confirmation": "هل أنت متأكد أنك تريد حذف هذا العميل؟"
      ,"pos_load_products_error": "تعذر تحميل المنتجات"
      ,"pos_intro_text": "ابحث عن المنتجات بالاسم أو رمز SKU أو الباركود، أضفها بسرعة إلى السلة، وسجّل المدفوعات المرنة."
      ,"pos_smart_product_search": "بحث ذكي عن المنتجات"
      ,"pos_product_search_placeholder": "اكتب اسم المنتج أو SKU أو الباركود"
      ,"pos_category_filter_label": "تصفية الفئة"
      ,"pos_filter_products_by_category": "تصفية المنتجات حسب هذه الفئة"
      ,"pos_no_search_results": "لا توجد نتائج بحث مطابقة"
      ,"pos_cart_empty": "لا توجد عناصر في السلة بعد."
      ,"pos_each": "للوحدة"
      ,"pos_search_products_group": "المنتجات"
      ,"pos_search_categories_group": "الفئات"
      ,"pos_search_customers_group": "العملاء"
      ,"inventory_load_error": "تعذر تحميل بيانات المخزون"
      ,"inventory_save_stock_status_error": "تعذر حفظ حالة المخزون"
      ,"inventory_mark_alerts_read_error": "تعذر تعليم التنبيهات كمقروءة"
      ,"inventory_create_transfer_error": "تعذر إنشاء التحويل"
      ,"inventory_approve_transfer_error": "تعذر اعتماد التحويل"
      ,"inventory_complete_transfer_error": "تعذر إكمال التحويل"
      ,"inventory_low_critical_stock": "مخزون منخفض/حرج"
      ,"inventory_critical_label": "حرج"
      ,"inventory_low_label": "منخفض"
      ,"inventory_unread_alerts": "تنبيهات غير مقروءة"
      ,"inventory_mark_all_read": "تعليم الكل كمقروء"
      ,"inventory_alert_message": "{{product}} في {{warehouse}}: {{current}} متوفر (الحد الأدنى {{threshold}})"
      ,"inventory_no_unread_alerts": "لا توجد تنبيهات غير مقروءة."
      ,"inventory_product_stock_status": "حالة مخزون المنتج"
      ,"inventory_stock_status_placeholder": "متوفر / غير متوفر"
      ,"inventory_create_stock_transfer": "إنشاء تحويل مخزون"
      ,"inventory_source_warehouse": "المستودع المصدر"
      ,"inventory_destination_warehouse": "المستودع الوجهة"
      ,"inventory_requires_supervisor_approval": "يتطلب موافقة المشرف"
      ,"inventory_add_line": "إضافة بند"
      ,"inventory_create_transfer": "إنشاء تحويل"
      ,"inventory_stock_transfers": "تحويلات المخزون"
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
