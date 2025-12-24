// ใส่ firebaseConfig ของคุณจาก Firebase Console (Project settings -> Your apps)
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// “ล็อกอินแบบง่าย” (คำเตือน: เก็บใน client จะถูกเห็นได้)
// แนะนำให้ใช้ในระบบปิด/ทีมเล็ก และเปลี่ยน PIN เป็นระยะ
export const LOGIN_PINS = {
  boss: "1111",
  producer: "2222"
};
