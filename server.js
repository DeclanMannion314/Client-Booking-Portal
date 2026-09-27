require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'jobs.json');

// Simple password protecting the dashboard. Change this before you deploy it.
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers to read/write jobs.json ---
function readJobs() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeJobs(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

// --- Email setup ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

function sendJobEmail(job) {
  const notifyEmail = process.env.NOTIFY_EMAIL || 'ggfloorscreed@gmail.com';

  const mailOptions = {
    from: process.env.SMTP_USER || 'noreply@example.com',
    to: notifyEmail,
    subject: `New job request: ${job.jobType} - ${job.name}`,
    text:
      `New job request submitted\n\n` +
      `Name: ${job.name}\n` +
      `Phone: ${job.phone}\n` +
      `Job type: ${job.jobType}\n` +
      `Site address: ${job.address}\n` +
      `Approx. size (sq mtrs): ${job.size}\n` +
      `Preferred date: ${job.preferredDate}\n` +
      `Notes: ${job.notes || 'None'}\n`
  };

  transporter.sendMail(mailOptions).catch((err) => {
    console.error('Email failed to send (job was still saved):', err.message);
  });
}

// --- Routes ---

// Submit a new job (called from the booking form)
app.post('/api/jobs', (req, res) => {
  const { name, phone, jobType, address, size, preferredDate, notes } = req.body;

  if (!name || !phone || !jobType || !address || !preferredDate) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const job = {
    id: Date.now().toString(),
    name,
    phone,
    jobType,
    address,
    size: size || '',
    preferredDate,
    notes: notes || '',
    status: 'new',
    scheduledDate: '',
    createdAt: new Date().toISOString()
  };

  const jobs = readJobs();
  jobs.push(job);
  writeJobs(jobs);

  sendJobEmail(job);

  res.status(201).json({ success: true, job });
});

// Simple password check middleware for dashboard routes
function requireDashboardAuth(req, res, next) {
  const password = req.headers['x-dashboard-password'] || req.query.password;
  if (password !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Get all jobs (dashboard)
app.get('/api/jobs', requireDashboardAuth, (req, res) => {
  res.json(readJobs());
});

// Update a job's status and/or scheduled date (dashboard)
app.patch('/api/jobs/:id', requireDashboardAuth, (req, res) => {
  const { status, scheduledDate } = req.body;
  const validStatuses = ['new', 'contacted', 'scheduled', 'done'];

  const jobs = readJobs();
  const job = jobs.find((j) => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (status !== undefined) {
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    job.status = status;
  }

  if (scheduledDate !== undefined) {
    job.scheduledDate = scheduledDate;
  }

  writeJobs(jobs);
  res.json({ success: true, job });
});

// Delete a job (dashboard)
app.delete('/api/jobs/:id', requireDashboardAuth, (req, res) => {
  const jobs = readJobs();
  const index = jobs.findIndex((j) => j.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  jobs.splice(index, 1);
  writeJobs(jobs);

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Booking app running on http://localhost:${PORT}`);
});