const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. ตั้งค่า Middleware (ปรับให้รองรับรูปภาพขนาดใหญ่)
app.use(cors({
  origin: 'https://helpdesk-frontend-amber.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // รองรับรูป Base64
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 2. เชื่อมต่อฐานข้อมูล
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB (it_fixit)'))
  .catch(err => console.error('❌ Connection Error:', err));

// --- 3. ออกแบบ Schemas ---

// ขอบเขตงานซ่อม
const RepairSchema = new mongoose.Schema({
  userId: String,
  problem_details: String,
  status: { type: String, default: 'Pending' },
  reported_at: { type: Date, default: Date.now },
  accepted_at: Date
});
const Repair = mongoose.model('Repair', RepairSchema);

// คลังอุปกรณ์ (ปรับตามหน้า UI พี่)
const InventorySchema = new mongoose.Schema({
  id: String,       // รหัสอุปกรณ์ เช่น IT-001
  name: String,     // ชื่ออุปกรณ์
  stock: Number,    // จำนวนคงเหลือ
  image: String,    // เก็บ Base64 ของรูปภาพ
  category: String,
  updated_at: { type: Date, default: Date.now }
});
const Inventory = mongoose.model('Inventory', InventorySchema);

// --- 4. API Routes (Repairs) ---

app.get('/', (req, res) => res.send('Repair API is Ready!'));

app.post('/api/repairs', async (req, res) => {
  try {
    const newJob = new Repair(req.body);
    await newJob.save();
    res.status(201).json({ success: true, id: newJob._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/repairs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await Repair.findByIdAndUpdate(
      id,
      { status: status || 'In Progress', accepted_at: new Date() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/repairs', async (req, res) => {
  const allJobs = await Repair.find().sort({ reported_at: -1 });
  res.json(allJobs);
});

// --- 5. API Routes (Inventory - CRUD) ---

app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find().sort({ updated_at: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const newItem = new Inventory(req.body);
    await newItem.save();
    res.status(201).json({ success: true, data: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inventory/:id', async (req, res) => {
  try {
    const updated = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    await Inventory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. รัน Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));