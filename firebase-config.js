// ใส่ firebaseConfig ของคุณจาก Firebase Console (Project settings -> Your apps)
export const firebaseConfig = {
  apiKey: "AIzaSyB9kw6sd8uyXQj1UlgMjG6_IxATjMJYPjw",
  authDomain: "factory-d76ec.firebaseapp.com",
  projectId: "factory-d76ec",
  storageBucket: "factory-d76ec.firebasestorage.app",
  messagingSenderId: "674988611414",
  appId: "1:674988611414:web:6cee7572067fd7b15728f7"
};

// “ล็อกอินแบบง่าย” (คำเตือน: เก็บใน client จะถูกเห็นได้)
// แนะนำให้ใช้ในระบบปิด/ทีมเล็ก และเปลี่ยน PIN เป็นระยะ
export const LOGIN_PINS = {
  boss: "1111",
  producer: "2222"
};
