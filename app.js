import { firebaseConfig, LOGIN_PINS } from "./firebase-config.js";

// Firebase modular via CDN (รองรับการใช้แบบไฟล์ static ได้) :contentReference[oaicite:4]{index=4}
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, orderBy, getDocs,
  runTransaction
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const el = (id)=>document.getElementById(id);
const fmt = (n)=>Number(n||0).toFixed(3);

let me = { uid:null, role:null, name:null };

// ---------------- UI: Tabs ----------------
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    showTab(tab);
  });
});

function showTab(tab){
  el("viewJobs").style.display = (tab==="jobs") ? "" : "none";
  el("viewStockPlastic").style.display = (tab==="stockPlastic") ? "" : "none";
  el("viewStockPart").style.display = (tab==="stockPart") ? "" : "none";
  el("viewCatalog").style.display = (tab==="catalog") ? "" : "none";
}

// ---------------- Login ----------------
el("btnLogin").addEventListener("click", async ()=>{
  el("loginMsg").textContent = "";
  const role = el("role").value;
  const pin = el("pin").value.trim();

  if (LOGIN_PINS[role] !== pin) {
    el("loginMsg").textContent = "PIN ไม่ถูกต้อง";
    return;
  }

  // 1) anonymous sign-in เพื่อให้ rules ใช้ request.auth ได้ :contentReference[oaicite:5]{index=5}
  const cred = await signInAnonymously(auth);

  // 2) ผูก role ลง users/{uid} (ให้ role ฝั่ง rules ใช้ได้)
  const name = role === "boss" ? "หัวหน้า" : "ผู้ผลิต";
  await setDoc(doc(db, "users", cred.user.uid), {
    role, name, updatedAt: serverTimestamp()
  }, { merge:true });

  el("pin").value = "";
});

el("btnLogout").addEventListener("click", ()=>signOut(auth));

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    me = { uid:null, role:null, name:null };
    el("who").textContent = "ยังไม่ล็อกอิน";
    el("loginCard").style.display = "";
    el("appCard").style.display = "none";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : {};
  me = { uid:user.uid, role:data.role || "unknown", name:data.name || "unknown" };

  el("who").textContent = `UID: ${me.uid.slice(0,8)}… | role: ${me.role}`;
  el("loginCard").style.display = "none";
  el("appCard").style.display = "";

  // เปิด/ซ่อนกล่องตาม role
  const isBoss = me.role === "boss";
  el("bossCreateJobBox").style.display = isBoss ? "" : "none";
  el("bossPlasticBox").style.display = isBoss ? "" : "none";
  el("bossCatalogBox").style.display = isBoss ? "" : "none";

  // โหลดข้อมูลเริ่มต้น
  await refreshAllPickers();
  await loadJobs();
  await loadPlastic();
  await loadPart();
  await loadCatalog();
});

// ---------------- Helpers ----------------
function statusBadge(status){
  const map = {
    TODO:"TODO", RUNNING:"กำลังเดินงาน", CUTTING:"กำลังตัดงาน",
    PACKING:"กำลังแพ็คงาน", DONE:"DONE"
  };
  return `<span class="badge">${map[status] || status}</span>`;
}

async function refreshAllPickers(){
  // picker วัสดุสำหรับสร้างงาน: ใช้ stock_plastic เป็นหลัก
  const plastics = await getDocs(query(collection(db, "stock_plastic"), orderBy("sku")));
  el("matSku").innerHTML = "";
  plastics.forEach(d=>{
    const it = d.data();
    const opt = document.createElement("option");
    opt.value = it.sku;
    opt.textContent = `${it.sku} — ${it.name} (คงเหลือ ${fmt(it.qty_on_hand)} ${it.unit})`;
    el("matSku").appendChild(opt);
  });

  // picker plastic ใน catalog
  el("cPlasticSku").innerHTML = "";
  plastics.forEach(d=>{
    const it = d.data();
    const opt = document.createElement("option");
    opt.value = it.sku;
    opt.textContent = `${it.sku} — ${it.name}`;
    el("cPlasticSku").appendChild(opt);
  });
}

// ---------------- JOBS ----------------
let tempMats = []; // [{sku, qty_required}]

el("btnAddMat").addEventListener("click", ()=>{
  const sku = el("matSku").value;
  const qty = Number(el("matQty").value.trim());
  if(!sku || !Number.isFinite(qty) || qty<=0){
    el("jobMsg").textContent = "กรุณาเลือก SKU และใส่จำนวนวัสดุ > 0";
    return;
  }
  const ex = tempMats.find(x=>x.sku===sku);
  if(ex) ex.qty_required += qty;
  else tempMats.push({ sku, qty_required: qty });
  el("matQty").value = "";
  renderTempMats();
});

el("btnClearJob").addEventListener("click", ()=>{
  el("jobCode").value="";
  el("jobThick").value="";
  el("jobQty").value="";
  el("jobDesc").value="";
  tempMats = [];
  renderTempMats();
  el("jobMsg").textContent="";
});

function renderTempMats(){
  if(tempMats.length===0){
    el("matList").textContent = "ยังไม่มีรายการวัสดุ";
    return;
  }
  el("matList").innerHTML = tempMats.map((m,i)=>
    `<div>• ${m.sku} : ${fmt(m.qty_required)} <a href="#" data-i="${i}">ลบ</a></div>`
  ).join("");
  el("matList").querySelectorAll("a").forEach(a=>{
    a.addEventListener("click",(e)=>{
      e.preventDefault();
      const idx = Number(a.dataset.i);
      tempMats.splice(idx,1);
      renderTempMats();
    });
  });
}

el("btnCreateJob").addEventListener("click", async ()=>{
  el("jobMsg").textContent = "";
  const jobCode = el("jobCode").value.trim().toUpperCase();
  const thick = Number(el("jobThick").value.trim());
  const qty = Number(el("jobQty").value.trim());
  const desc = el("jobDesc").value.trim();

  if(!jobCode) return (el("jobMsg").textContent="กรุณาใส่รหัสงาน");
  if(!Number.isFinite(thick) || thick<=0) return (el("jobMsg").textContent="ความหนาต้อง >0");
  if(!Number.isFinite(qty) || qty<=0) return (el("jobMsg").textContent="จำนวนต้อง >0");
  if(tempMats.length===0) return (el("jobMsg").textContent="กรุณาเพิ่มวัสดุอย่างน้อย 1 รายการ");

  // doc id ใช้ jobCode
  await setDoc(doc(db, "jobs", jobCode), {
    jobCode,
    thickness_mm: thick,
    quantity_required: qty,
    description: desc,
    status: "TODO",
    materials: tempMats,
    createdBy: me.uid,
    createdAt: serverTimestamp(),
    finishedBy: null,
    finishedAt: null
  }, { merge:false });

  el("jobMsg").textContent = "สร้างงานสำเร็จ";
  el("btnClearJob").click();
  await loadJobs();
});

el("btnReloadJobs").addEventListener("click", loadJobs);

async function loadJobs(){
  const qText = el("qJob").value.trim().toUpperCase();
  const st = el("jobFilter").value;

  // Firestore ไม่มี contains แบบง่ายกับหลาย field; เอาง่าย: โหลดตาม status ถ้ามี
  let qRef = collection(db, "jobs");
  let qx;

  if(st){
    qx = query(qRef, where("status","==",st), orderBy("jobCode"));
  }else{
    qx = query(qRef, orderBy("jobCode"));
  }

  const snap = await getDocs(qx);
  const rows = [];
  snap.forEach(d=>{
    const j = d.data();
    if(qText && !String(j.jobCode||"").toUpperCase().includes(qText)) return;
    rows.push(j);
  });

  const tb = el("jobsTable").querySelector("tbody");
  tb.innerHTML = rows.map(j=>{
    return `
      <tr>
        <td><b>${j.jobCode}</b></td>
        <td>${fmt(j.thickness_mm)}</td>
        <td>${j.quantity_required}</td>
        <td>${statusBadge(j.status)}</td>
        <td>
          <div class="row">
            <button class="btn" data-act="run" data-id="${j.jobCode}">RUN</button>
            <button class="btn" data-act="cut" data-id="${j.jobCode}">CUT</button>
            <button class="btn" data-act="pack" data-id="${j.jobCode}">PACK</button>
            <button class="btn primary" data-act="done" data-id="${j.jobCode}">DONE</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5">ไม่พบงาน</td></tr>`;

  tb.querySelectorAll("button").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const id = b.dataset.id;
      const act = b.dataset.act;
      if(act==="run") await updateJobStatus(id,"RUNNING");
      if(act==="cut") await updateJobStatus(id,"CUTTING");
      if(act==="pack") await updateJobStatus(id,"PACKING");
      if(act==="done") await finishJobTransaction(id);
    });
  });
}

async function updateJobStatus(jobCode, status){
  await setDoc(doc(db,"jobs",jobCode), { status, updatedAt: serverTimestamp() }, { merge:true });
  await loadJobs();
}

// DONE: หัก stock_plastic ตาม materials + บันทึก stock_moves + set DONE (transaction)
async function finishJobTransaction(jobCode){
  el("jobsMsg").textContent = "";
  if(!confirm(`ยืนยัน DONE งาน ${jobCode}? ระบบจะตัดสต็อกพลาสติกตามวัสดุที่กำหนด`)) return;

  try{
    await runTransaction(db, async (tx)=>{
      const jobRef = doc(db,"jobs",jobCode);
      const jobSnap = await tx.get(jobRef);
      if(!jobSnap.exists()) throw new Error("ไม่พบงาน");
      const job = jobSnap.data();
      if(job.status === "DONE") throw new Error("งาน DONE แล้ว");

      const mats = Array.isArray(job.materials) ? job.materials : [];
      // เช็ค stock พอไหม
      for(const m of mats){
        const sku = m.sku;
        const need = Number(m.qty_required||0);
        const stRef = doc(db,"stock_plastic", sku);
        const stSnap = await tx.get(stRef);
        if(!stSnap.exists()) throw new Error(`ไม่พบ stock_plastic: ${sku}`);
        const st = stSnap.data();
        const onhand = Number(st.qty_on_hand||0);
        if(onhand < need) throw new Error(`สต็อกไม่พอ: ${sku} (มี ${onhand}, ต้องใช้ ${need})`);
      }

      // ตัดสต็อก + moves
      for(const m of mats){
        const sku = m.sku;
        const need = Number(m.qty_required||0);
        const stRef = doc(db,"stock_plastic", sku);
        const stSnap = await tx.get(stRef);
        const st = stSnap.data();
        const onhand = Number(st.qty_on_hand||0);

        tx.set(stRef, { qty_on_hand: onhand - need, updatedAt: serverTimestamp() }, { merge:true });

        const moveRef = doc(collection(db,"stock_moves"));
        tx.set(moveRef, {
          sku,
          type: "OUT",
          qty: need,
          at: serverTimestamp(),
          userId: me.uid,
          refJobCode: jobCode,
          note: "consume at DONE"
        });
      }

      tx.set(jobRef, {
        status: "DONE",
        finishedBy: me.uid,
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge:true });
    });

    el("jobsMsg").textContent = "DONE สำเร็จ และตัดสต็อกแล้ว";
    await refreshAllPickers();
    await loadJobs();
    await loadPlastic();
  }catch(err){
    el("jobsMsg").textContent = `ทำรายการไม่สำเร็จ: ${err.message || err}`;
  }
}

// ---------------- STOCK PLASTIC (boss only via rules) ----------------
el("btnReloadPlastic").addEventListener("click", loadPlastic);

el("btnAddPlastic").addEventListener("click", async ()=>{
  el("pMsg").textContent = "";
  const sku = el("pSku").value.trim().toUpperCase();
  const name = el("pName").value.trim();
  const unit = el("pUnit").value.trim();
  const qty = Number(el("pQty").value.trim());
  if(!sku || !name || !unit) return (el("pMsg").textContent="กรอก SKU/ชื่อ/หน่วย");
  if(!Number.isFinite(qty) || qty<0) return (el("pMsg").textContent="qty ต้อง >= 0");

  await setDoc(doc(db,"stock_plastic", sku), {
    sku, name, unit, qty_on_hand: qty, active:true, updatedAt: serverTimestamp()
  }, { merge:true });

  el("pMsg").textContent = "บันทึกสำเร็จ";
  await refreshAllPickers();
  await loadPlastic();
});

async function loadPlastic(){
  const qText = el("qPlastic").value.trim().toUpperCase();
  const snap = await getDocs(query(collection(db,"stock_plastic"), orderBy("sku")));
  const rows = [];
  snap.forEach(d=>{
    const it = d.data();
    if(qText && !(String(it.sku||"")+String(it.name||"")).toUpperCase().includes(qText)) return;
    rows.push(it);
  });

  const tb = el("plasticTable").querySelector("tbody");
  tb.innerHTML = rows.map(it=>`
    <tr>
      <td><b>${it.sku}</b></td>
      <td>${it.name}</td>
      <td>${it.unit}</td>
      <td class="r">${fmt(it.qty_on_hand)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">ไม่พบรายการ</td></tr>`;
}

// ---------------- STOCK PART (boss + producer) ----------------
el("btnReloadPart").addEventListener("click", loadPart);

el("btnUpsertPart").addEventListener("click", async ()=>{
  el("sMsg").textContent="";
  const sku = el("sSku").value.trim().toUpperCase();
  const name = el("sName").value.trim();
  const unit = el("sUnit").value.trim();
  const qty = Number(el("sQty").value.trim());
  if(!sku || !name || !unit) return (el("sMsg").textContent="กรอก SKU/ชื่อ/หน่วย");
  if(!Number.isFinite(qty) || qty<0) return (el("sMsg").textContent="qty ต้อง >= 0");

  await setDoc(doc(db,"stock_part", sku), {
    sku, name, unit, qty_on_hand: qty, active:true, updatedAt: serverTimestamp()
  }, { merge:true });

  // บันทึก move (audit)
  await setDoc(doc(collection(db,"stock_moves")), {
    sku, type:"ADJUST", qty, at: serverTimestamp(),
    userId: me.uid, refJobCode:null, note:"set qty_on_hand"
  });

  el("sMsg").textContent="บันทึกสำเร็จ";
  await loadPart();
});

el("btnAdjustPart").addEventListener("click", async ()=>{
  el("sMsg").textContent="";
  const sku = el("sSku").value.trim().toUpperCase();
  const delta = Number(el("delta").value.trim());
  const note = el("deltaNote").value.trim() || "manual";
  if(!sku) return (el("sMsg").textContent="กรอก SKU");
  if(!Number.isFinite(delta) || delta===0) return (el("sMsg").textContent="delta ต้องเป็นตัวเลขและไม่เป็น 0");

  try{
    await runTransaction(db, async (tx)=>{
      const ref = doc(db,"stock_part", sku);
      const snap = await tx.get(ref);
      if(!snap.exists()) throw new Error("ไม่พบ SKU ใน stock_part");
      const it = snap.data();
      const onhand = Number(it.qty_on_hand||0);
      const next = onhand + delta;
      if(next < 0) throw new Error("ยอดจะติดลบ");

      tx.set(ref, { qty_on_hand: next, updatedAt: serverTimestamp() }, { merge:true });

      const moveRef = doc(collection(db,"stock_moves"));
      tx.set(moveRef, {
        sku,
        type: delta>0 ? "IN" : "OUT",
        qty: Math.abs(delta),
        at: serverTimestamp(),
        userId: me.uid,
        refJobCode: null,
        note
      });
    });

    el("sMsg").textContent="ปรับสต็อกสำเร็จ";
    el("delta").value=""; el("deltaNote").value="";
    await loadPart();
  }catch(err){
    el("sMsg").textContent = `ทำรายการไม่สำเร็จ: ${err.message || err}`;
  }
});

async function loadPart(){
  const qText = el("qPart").value.trim().toUpperCase();
  const snap = await getDocs(query(collection(db,"stock_part"), orderBy("sku")));
  const rows = [];
  snap.forEach(d=>{
    const it = d.data();
    if(qText && !(String(it.sku||"")+String(it.name||"")).toUpperCase().includes(qText)) return;
    rows.push(it);
  });

  const tb = el("partTable").querySelector("tbody");
  tb.innerHTML = rows.map(it=>`
    <tr>
      <td><b>${it.sku}</b></td>
      <td>${it.name}</td>
      <td>${it.unit}</td>
      <td class="r">${fmt(it.qty_on_hand)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">ไม่พบรายการ</td></tr>`;
}

// ---------------- CATALOG (boss) + upload image to Storage ----------------
el("btnReloadCat").addEventListener("click", loadCatalog);

el("btnAddCatalog").addEventListener("click", async ()=>{
  el("cMsg").textContent="";
  const code = el("cCode").value.trim().toUpperCase();
  const name = el("cName").value.trim();
  const size = el("cSize").value.trim();
  const thick = Number(el("cThick").value.trim());
  const plasticSku = el("cPlasticSku").value;
  const file = el("cFile").files && el("cFile").files[0];

  if(!code || !name) return (el("cMsg").textContent="กรอก code/ชื่อ");
  if(!Number.isFinite(thick) || thick<=0) return (el("cMsg").textContent="ความหนา > 0");
  if(!plasticSku) return (el("cMsg").textContent="เลือกพลาสติก");
  if(!file) return (el("cMsg").textContent="เลือกไฟล์รูป PNG/JPG");

  // 1) upload to storage
  const path = `products/${code}/${Date.now()}_${file.name}`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);

  // 2) write catalog doc
  await setDoc(doc(db,"catalog", code), {
    code, name, size, thickness_mm: thick, plasticSku,
    imageUrl: url,
    updatedAt: serverTimestamp()
  }, { merge:true });

  el("cMsg").textContent="บันทึกสินค้า + อัปโหลดรูปสำเร็จ";
  el("cFile").value="";
  await loadCatalog();
});

async function loadCatalog(){
  const qText = el("qCat").value.trim().toUpperCase();
  const snap = await getDocs(query(collection(db,"catalog"), orderBy("code")));
  const rows = [];
  snap.forEach(d=>{
    const it = d.data();
    if(qText && !(String(it.code||"")+String(it.name||"")).toUpperCase().includes(qText)) return;
    rows.push(it);
  });

  const tb = el("catTable").querySelector("tbody");
  tb.innerHTML = rows.map(it=>`
    <tr>
      <td>${it.imageUrl ? `<img class="thumb" src="${it.imageUrl}" />` : "-"}</td>
      <td><b>${it.code}</b></td>
      <td>${it.name}</td>
      <td>${it.size || "-"}</td>
      <td>${fmt(it.thickness_mm)}</td>
      <td>${it.plasticSku || "-"}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">ไม่พบรายการ</td></tr>`;
}
