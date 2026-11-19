require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const SECURE_CORE_URL = process.env.SECURE_CORE_URL || 'http://secure-core:8080';
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://ai-engine:8000';

// Health check route
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        service: 'Enterprise API Gateway',
        timestamp: new Date().toISOString()
    });
});

// Live Microservice Health Check (Gateway + Spring Core + AI Engine)
app.get('/api/v1/system/health', async (req, res) => {
    let secureCore = 'DOWN';
    let aiEngine = 'DOWN';

    try {
        await axios.get(`${SECURE_CORE_URL}/health`, { timeout: 2500 });
        secureCore = 'UP';
    } catch (err) {
        if (err.response) secureCore = 'UP';
    }

    try {
        await axios.get(`${AI_ENGINE_URL}/health`, { timeout: 2500 });
        aiEngine = 'UP';
    } catch (err) {
        if (err.response) aiEngine = 'UP';
    }

    res.status(200).json({
        gateway: 'UP',
        secureCore,
        aiEngine,
        timestamp: new Date().toISOString()
    });
});

// Fetch saved task history from Neon PostgreSQL
app.get('/api/v1/enterprise/history', async (req, res) => {
    try {
        const logs = await prisma.taskLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        res.status(200).json(logs);
    } catch (error) {
        console.error("Database Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch task history" });
    }
});

// Delete a single task from Neon PostgreSQL
app.delete('/api/v1/enterprise/history/:id', async (req, res) => {
    try {
        await prisma.taskLog.deleteMany({
            where: { id: req.params.id }
        });
        res.status(200).json({ message: "Task deleted" });
    } catch (error) {
        console.error("Delete Error:", error.message);
        res.status(500).json({ error: "Failed to delete task" });
    }
});

// Clear ALL task history from Neon PostgreSQL
app.delete('/api/v1/enterprise/history', async (req, res) => {
    try {
        await prisma.taskLog.deleteMany({});
        res.status(200).json({ message: "All history cleared" });
    } catch (error) {
        console.error("Clear History Error:", error.message);
        res.status(500).json({ error: "Failed to clear history" });
    }
});

// Proxy route connecting Gateway to Python AI Engine
app.post('/api/v1/agent/execute', async (req, res) => {
    try {
        console.log("Routing payload to Python AI Engine...");
        const aiResponse = await axios.post(`${AI_ENGINE_URL}/execute-workflow`, req.body);

        res.status(200).json({
            message: "Gateway successfully routed to AI Engine",
            data: aiResponse.data
        });
    } catch (error) {
        console.error("AI Engine Communication Error:", error.message);
        res.status(500).json({
            error: "Failed to communicate with AI Engine Service",
            details: error.message
        });
    }
});

// Enterprise Pipeline: Gateway -> Spring Boot (Audit) -> Python (AI) -> Neon DB
app.post('/api/v1/enterprise/process', async (req, res) => {
    const startTime = Date.now();
    try {
        console.log("Step 1: Sending to Spring Boot for Security Audit...");
        const auditResponse = await axios.post(`${SECURE_CORE_URL}/api/v1/secure/audit`, req.body);

        console.log("Step 2: Audit cleared. Routing to Python AI Engine...");
        const aiResponse = await axios.post(`${AI_ENGINE_URL}/execute-workflow`, req.body);

        console.log("Step 3: Saving execution log to Neon PostgreSQL...");
        const savedLog = await prisma.taskLog.create({
            data: {
                taskId: req.body.task_id || `TASK-${Date.now()}`,
                userId: req.body.user_id || "authenticated_user",
                prompt: req.body.prompt || "No prompt provided",
                auditStatus: auditResponse.data?.status || "SECURE_VERIFIED",
                aiOutput: aiResponse.data
            }
        });

        const executionTimeSec = ((Date.now() - startTime) / 1000).toFixed(2);

        res.status(200).json({
            pipeline_status: "COMPLETED",
            execution_time_sec: executionTimeSec,
            log_id: savedLog.id,
            security_audit: auditResponse.data,
            ai_execution: aiResponse.data
        });
    } catch (error) {
        console.error("Pipeline Error:", error.message);
        res.status(500).json({
            error: "Microservice Pipeline Interrupted",
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Enterprise API Gateway running on port ${PORT}`);
});