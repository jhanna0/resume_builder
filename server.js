const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Load resume data
app.get('/api/resume', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to load data' });
        }
        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch (err) {
            res.status(500).json({ error: 'Invalid data format' });
        }
    });
});

// Save resume data
app.post('/api/resume', (req, res) => {
    fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to save data' });
        }
        res.json({ message: 'Data saved successfully' });
    });
});

// Generate PDF using Puppeteer
app.post('/api/generate-pdf', async (req, res) => {
    let browser;
    try {
        const { html, theme } = req.body;

        if (!html) {
            throw new Error('No HTML content received');
        }


        // Launch Puppeteer with debugging
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--font-render-hinting=none'
            ]
        });

        const page = await browser.newPage();

        // Set viewport to A4 size
        await page.setViewport({
            width: 794, // A4 width in pixels at 96 DPI
            height: 1123, // A4 height in pixels at 96 DPI
            deviceScaleFactor: 2 // For better quality
        });

        // Enable request logging
        page.on('console', msg => console.log('Page console:', msg.text()));
        page.on('pageerror', err => console.error('Page error:', err));
        page.on('error', err => console.error('Error:', err));

        // Set content with proper styling
        await page.setContent(html, {
            waitUntil: ['networkidle0', 'domcontentloaded', 'load']
        });

        // Wait for fonts to load
        await page.evaluate(() => document.fonts.ready);

        // Inject the theme variables and styles
        await page.evaluate((theme) => {
            document.documentElement.setAttribute('data-theme', theme);

            // Return a promise that resolves when all images and fonts are loaded
            return Promise.all([
                document.fonts.ready,
                Promise.all(
                    Array.from(document.images)
                        .filter(img => !img.complete)
                        .map(img => new Promise(resolve => {
                            img.onload = img.onerror = resolve;
                        }))
                )
            ]);
        }, theme);

        // Debug: Check if resume content exists and is styled
        const contentCheck = await page.evaluate(() => {
            const content = document.getElementById('resumeContent');
            if (!content) {
                return { success: false, error: 'Resume content not found' };
            }

            const styles = window.getComputedStyle(content);
            const headerColor = window.getComputedStyle(document.querySelector('.resume-header h1') || {}).color;

            // Log all computed styles for debugging
            const allStyles = {};
            for (let prop of styles) {
                allStyles[prop] = styles.getPropertyValue(prop);
            }

            return {
                success: true,
                hasContent: content.innerHTML.length > 0,
                backgroundColor: styles.backgroundColor,
                color: styles.color,
                headerColor,
                themeAttribute: document.documentElement.getAttribute('data-theme'),
                allStyles,
                html: content.innerHTML
            };
        });

        if (!contentCheck.success) {
            throw new Error(contentCheck.error);
        }

        // Generate PDF with more specific settings
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm'
            },
            preferCSSPageSize: true,
            displayHeaderFooter: false,
            scale: 1,
            landscape: false
        });


        // Verify PDF header using Buffer
        const pdfHeader = Buffer.from(pdf.slice(0, 8)).toString();

        // Check if it's a valid PDF (should start with %PDF-)
        if (pdf.length < 8 || !pdfHeader.startsWith('%PDF-')) {
            throw new Error(`Invalid PDF header: ${pdfHeader}`);
        }

        // Send PDF as response with explicit headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdf.length);
        res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Accept-Ranges', 'bytes');

        // Send the PDF as a Buffer to ensure binary data integrity
        res.send(Buffer.from(pdf));
    } catch (error) {
        console.error('PDF generation error:', error);
        // Send more detailed error information
        res.status(500).json({
            error: 'Failed to generate PDF',
            details: error.message,
            stack: error.stack
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});