'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const { log, logsDir } = require('../config/logger');

const router = Router();

router.get('/admin/logs/list', (req, res) => {
    try {
        if (!fs.existsSync(logsDir)) return res.json({ status: true, files: [] });
        const files = fs.readdirSync(logsDir)
            .filter(f => f.endsWith('.log'))
            .map(f => {
                const stats = fs.statSync(path.join(logsDir, f));
                return { name: f, size: stats.size, sizeHuman: (stats.size / 1024).toFixed(2) + ' KB', modified: stats.mtime };
            })
            .sort((a, b) => b.modified - a.modified);
        res.json({ status: true, files });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/admin/logs/combined', (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 1000;
        const combinedPath = path.join(logsDir, 'combined.log');
        if (!fs.existsSync(combinedPath)) return res.json({ status: true, content: 'No logs available yet.' });
        const allLines = fs.readFileSync(combinedPath, 'utf8').split('\n');
        res.json({ status: true, totalLines: allLines.length, returnedLines: Math.min(lines, allLines.length), content: allLines.slice(-lines).join('\n') });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

router.get('/admin/logs/view/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const lines = parseInt(req.query.lines) || 500;
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ status: false, message: 'Invalid filename' });
        }
        const logPath = path.join(logsDir, filename);
        if (!fs.existsSync(logPath)) return res.status(404).json({ status: false, message: 'Log file not found' });
        const allLines = fs.readFileSync(logPath, 'utf8').split('\n');
        res.json({ status: true, filename, totalLines: allLines.length, returnedLines: Math.min(lines, allLines.length), content: allLines.slice(-lines).join('\n') });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

router.delete('/admin/logs/clear', (req, res) => {
    try {
        if (!fs.existsSync(logsDir)) return res.json({ status: true, message: 'No logs to clear' });
        const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        files.forEach(f => fs.unlinkSync(path.join(logsDir, f)));
        log.warn('All logs cleared by admin');
        res.json({ status: true, message: `${files.length} log files cleared`, filesDeleted: files });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

module.exports = router;
