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
