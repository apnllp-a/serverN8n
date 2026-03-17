const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. เชื่อมต่อฐานข้อมูล
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ Connection Error:', err));

// 2. ออกแบบ Schema (ขอบเขตงานซ่อม)
const RepairSchema = new mongoose.Schema({
  userId: String,           // ID คนแจ้ง
  problem_details: String,  // รายละเอียด
  status: { type: String, default: 'Pending' }, // Pending, In Progress, Completed
  reported_at: { type: Date, default: Date.now },
  accepted_at: Date         // เวลาที่ช่างกดรับ
});

const Repair = mongoose.model('Repair', RepairSchema);

// --- 3. API Routes ---

// A. หน้าแรกเช็คสถานะ API
app.get('/', (req, res) => res.send('Repair API is Ready!'));

// B. แจ้งซ่อม (n8n จะยิงมาที่นี่ขา #แจ้งซ่อม)
app.post('/api/repairs', async (req, res) => {
  try {
    const newJob = new Repair(req.body);
    await newJob.save();
    res.status(201).json({ success: true, id: newJob._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// C. อัปเดตสถานะ (n8n จะยิงมาที่นี่ขา #รับงาน)
app.put('/api/repairs/:id', async (req, res) => {
  try {
    const updated = await Repair.findByIdAndUpdate(
      req.params.id,
      { status: 'In Progress', accepted_at: new Date() },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Update Failed' });
  }
});

// D. ดึงข้อมูลไปโชว์หน้าเว็บ
app.get('/api/repairs', async (req, res) => {
  const allJobs = await Repair.find().sort({ reported_at: -1 });
  res.json(allJobs);
});

// 4. รัน Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));