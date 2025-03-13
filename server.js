import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import pool from './db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

async function createDefaultResume(userId) {
    // Get user's ID from UUID
    const userResult = await pool.query('SELECT id FROM users WHERE uuid = $1', [userId]);
    if (userResult.rows.length === 0) {
        throw new Error('User not found');
    }

    const userIdNum = userResult.rows[0].id;
    const defaultResumeUuid = uuidv4();

    // Create default resume
    const newResumeResult = await pool.query(
        `INSERT INTO resumes (uuid, user_id, title, full_name, contact_info) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, uuid, title, full_name, contact_info`,
        [defaultResumeUuid, userIdNum, 'My Resume', '', '']
    );

    // Create default variation
    const defaultVariationUuid = uuidv4();
    await pool.query(
        `INSERT INTO resume_variations (uuid, resume_id, name, bio, theme, spacing)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [defaultVariationUuid, newResumeResult.rows[0].id, 'Default', '', 'default', 'normal']
    );

    // Create a default "Experience" section
    const defaultSectionUuid = uuidv4();
    await pool.query(
        `INSERT INTO sections (uuid, resume_id, name, order_index)
         VALUES ($1, $2, $3, $4)`,
        [defaultSectionUuid, newResumeResult.rows[0].id, 'Experience', 0]
    );

    // Return the new resume data
    return newResumeResult.rows;
}

// User registration
app.post('/api/register', async (req, res) => {
    const client = await pool.connect();
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Check if user already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        await client.query('BEGIN');

        // Create user with UUID
        const userUuid = uuidv4();
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const userResult = await client.query(
            `INSERT INTO users (uuid, email, password_hash) 
             VALUES ($1, LOWER($2), $3) 
             RETURNING id, uuid`,
            [userUuid, email, passwordHash]
        );

        // Create a new empty resume for the user
        const resumeUuid = uuidv4();
        const resumeId = await client.query(
            `INSERT INTO resumes (uuid, user_id, title, full_name, contact_info) 
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [resumeUuid, userResult.rows[0].id, 'My Resume', '', '']
        );

        await client.query('COMMIT');

        res.json({
            message: 'Registration successful',
            userId: userUuid
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Failed to register user' });
    } finally {
        client.release();
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const client = await pool.connect();
    try {
        const { email, password, existingResume } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Get user (case-insensitive email comparison)
        const userResult = await client.query(
            'SELECT uuid, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = userResult.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // If we have an existing resume, merge it with the user's resume
        if (existingResume && existingResume.id) {
            await client.query('BEGIN');

            try {
                // Get the user's current resume
                const currentResumeResult = await client.query(
                    'SELECT id FROM resumes WHERE user_id = (SELECT id FROM users WHERE uuid = $1)',
                    [user.uuid]
                );

                if (currentResumeResult.rows.length === 0) {
                    throw new Error('No resume found for user');
                }

                const currentResumeId = currentResumeResult.rows[0].id;

                // Insert sections
                for (const section of existingResume.sections || []) {
                    await client.query(
                        `INSERT INTO sections (uuid, resume_id, name, order_index)
                         VALUES ($1, $2, $3, $4)`,
                        [section.id, currentResumeId, section.name, section.order_index]
                    );
                }

                // Insert jobs
                for (const job of existingResume.jobs || []) {
                    await client.query(
                        `INSERT INTO jobs (uuid, resume_id, section_id, title, company, start_date, end_date, order_index)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [job.id, currentResumeId, job.section_id, job.title, job.company,
                        job.start_date, job.end_date, job.order_index]
                    );
                }

                // Insert bullet points
                for (const bullet of existingResume.bulletPoints || []) {
                    await client.query(
                        `INSERT INTO bullet_points (uuid, job_id, content, order_index)
                         VALUES ($1, $2, $3, $4)`,
                        [bullet.id, bullet.job_id, bullet.content, bullet.order_index]
                    );
                }

                // Update resume metadata if the existing resume has more complete info
                if (existingResume.full_name || existingResume.contact_info) {
                    await client.query(
                        `UPDATE resumes 
                         SET title = COALESCE(NULLIF($1, ''), title),
                             full_name = COALESCE(NULLIF($2, ''), full_name),
                             contact_info = COALESCE(NULLIF($3, ''), contact_info)
                         WHERE id = $4`,
                        [existingResume.title, existingResume.full_name, existingResume.contact_info, currentResumeId]
                    );
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                console.error('Error merging resumes:', error);
                // Continue with login even if merge fails
            }
        }

        res.json({
            message: 'Login successful',
            userId: user.uuid
        });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: 'Failed to log in' });
    } finally {
        client.release();
    }
});

// Load resume data
app.get('/api/resume/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Get the user's resume
        const resumeResult = await pool.query(
            'SELECT id, uuid, title, full_name, contact_info FROM resumes WHERE user_id = (SELECT id FROM users WHERE uuid = $1) LIMIT 1',
            [userId]
        );

        if (resumeResult.rows.length === 0) {
            // Create a default resume for new users
            resumeResult.rows = await createDefaultResume(userId);
        }

        const resumeId = resumeResult.rows[0].id;

        // Get all sections in order
        const sectionsResult = await pool.query(
            'SELECT id, uuid, name, order_index FROM sections WHERE resume_id = $1 ORDER BY order_index ASC',
            [resumeId]
        );

        // Get all jobs in order
        const jobsResult = await pool.query(
            'SELECT id, uuid, section_id, title, company, start_date, end_date, order_index FROM jobs WHERE resume_id = $1 ORDER BY order_index ASC',
            [resumeId]
        );

        // Get all bullet points in order
        const bulletPointsResult = await pool.query(
            'SELECT bp.id, bp.uuid, bp.job_id, bp.content, bp.order_index FROM bullet_points bp ' +
            'JOIN jobs j ON bp.job_id = j.id ' +
            'WHERE j.resume_id = $1 ' +
            'ORDER BY bp.order_index ASC',
            [resumeId]
        );

        // Get all variations
        const variationsResult = await pool.query(
            'SELECT id, uuid, name, bio, theme, spacing FROM resume_variations WHERE resume_id = $1',
            [resumeId]
        );

        // Get bullet point visibility for all variations
        const visibilityResult = await pool.query(
            `SELECT bpv.variation_id, bpv.bullet_point_id, bpv.is_visible
             FROM bullet_point_visibility bpv
             JOIN resume_variations rv ON bpv.variation_id = rv.id
             WHERE rv.resume_id = $1`,
            [resumeId]
        );

        // Structure the response
        const response = {
            id: resumeResult.rows[0].uuid, // Send UUID to frontend
            title: resumeResult.rows[0].title,
            full_name: resumeResult.rows[0].full_name,
            contact_info: resumeResult.rows[0].contact_info,
            sections: sectionsResult.rows.map(s => ({
                ...s,
                id: s.uuid // Send UUID to frontend
            })),
            jobs: jobsResult.rows.map(j => ({
                ...j,
                id: j.uuid, // Send UUID to frontend
                section_id: sectionsResult.rows.find(s => s.id === j.section_id)?.uuid // Map to section UUID
            })),
            bulletPoints: bulletPointsResult.rows.map(bp => ({
                ...bp,
                id: bp.uuid, // Send UUID to frontend
                job_id: jobsResult.rows.find(j => j.id === bp.job_id)?.uuid // Map to job UUID
            })),
            variations: variationsResult.rows.reduce((acc, variation) => {
                // Get visibility map for this variation
                const visibilityMap = visibilityResult.rows
                    .filter(v => v.variation_id === variation.id)
                    .reduce((map, v) => {
                        const bulletUuid = bulletPointsResult.rows.find(bp => bp.id === v.bullet_point_id)?.uuid;
                        if (bulletUuid) {
                            map[bulletUuid] = v.is_visible;
                        }
                        return map;
                    }, {});

                acc[variation.uuid] = { // Use UUID as key
                    ...variation,
                    id: variation.uuid, // Send UUID to frontend
                    bulletPoints: bulletPointsResult.rows.map(bp => ({
                        bullet_point_id: bp.uuid, // Use UUID
                        is_visible: visibilityMap[bp.uuid] ?? true // Default to visible if not set
                    }))
                };
                return acc;
            }, {})
        };

        res.json(response);
    } catch (error) {
        console.error('Error loading resume:', error);
        res.status(500).json({ error: 'Failed to load resume data' });
    }
});

// Save resume data
app.post('/api/resume/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;
        const { id: resumeUuid, title, full_name, contact_info, sections, jobs, bulletPoints, variations } = req.body;

        await client.query('BEGIN');

        // Get user's ID from UUID
        const userResult = await client.query('SELECT id FROM users WHERE uuid = $1', [userId]);
        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }
        const userIdNum = userResult.rows[0].id;

        // Update or create resume
        const resumeResult = await client.query(
            `INSERT INTO resumes (uuid, user_id, title, full_name, contact_info) 
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (uuid) 
             DO UPDATE SET title = $3, full_name = $4, contact_info = $5
             RETURNING id`,
            [resumeUuid, userIdNum, title, full_name, contact_info]
        );
        const resumeId = resumeResult.rows[0].id;

        // Get existing items to determine what to delete
        const existingSections = await client.query('SELECT id, uuid FROM sections WHERE resume_id = $1', [resumeId]);
        const existingJobs = await client.query('SELECT id, uuid FROM jobs WHERE resume_id = $1', [resumeId]);
        const existingBullets = await client.query(
            'SELECT id, uuid FROM bullet_points WHERE job_id IN (SELECT id FROM jobs WHERE resume_id = $1)',
            [resumeId]
        );

        // Create maps for looking up internal IDs
        const sectionIdMap = new Map(existingSections.rows.map(s => [s.uuid, s.id]));
        const jobIdMap = new Map(existingJobs.rows.map(j => [j.uuid, j.id]));
        const bulletIdMap = new Map(existingBullets.rows.map(b => [b.uuid, b.id]));

        // Delete items that are no longer present
        const keepSectionUuids = new Set(sections.map(s => s.id));
        const keepJobUuids = new Set(jobs.map(j => j.id));
        const keepBulletUuids = new Set(bulletPoints.map(b => b.id));

        for (const section of existingSections.rows) {
            if (!keepSectionUuids.has(section.uuid)) {
                await client.query('DELETE FROM sections WHERE id = $1', [section.id]);
            }
        }

        for (const job of existingJobs.rows) {
            if (!keepJobUuids.has(job.uuid)) {
                await client.query('DELETE FROM jobs WHERE id = $1', [job.id]);
            }
        }

        for (const bullet of existingBullets.rows) {
            if (!keepBulletUuids.has(bullet.uuid)) {
                await client.query('DELETE FROM bullet_points WHERE id = $1', [bullet.id]);
            }
        }

        // Insert or update sections
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const result = await client.query(
                `INSERT INTO sections (uuid, resume_id, name, order_index) 
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (uuid) 
                 DO UPDATE SET name = $3, order_index = $4
                 RETURNING id`,
                [section.id, resumeId, section.name, i]
            );
            sectionIdMap.set(section.id, result.rows[0].id);
        }

        // Insert or update jobs
        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            const sectionId = sectionIdMap.get(job.section_id);
            if (!sectionId) continue;

            const result = await client.query(
                `INSERT INTO jobs 
                 (uuid, resume_id, section_id, title, company, start_date, end_date, order_index) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (uuid)
                 DO UPDATE SET section_id = $3, title = $4, company = $5, 
                             start_date = $6, end_date = $7, order_index = $8
                 RETURNING id`,
                [job.id, resumeId, sectionId, job.title, job.company, job.start_date, job.end_date, i]
            );
            jobIdMap.set(job.id, result.rows[0].id);
        }

        // Insert or update bullet points
        for (let i = 0; i < bulletPoints.length; i++) {
            const bullet = bulletPoints[i];
            const jobId = jobIdMap.get(bullet.job_id);
            if (!jobId) continue;

            const result = await client.query(
                `INSERT INTO bullet_points (uuid, job_id, content, order_index) 
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (uuid)
                 DO UPDATE SET content = $3, order_index = $4
                 RETURNING id`,
                [bullet.id, jobId, bullet.content, i]
            );
            bulletIdMap.set(bullet.id, result.rows[0].id);
        }

        // Handle variations
        for (const [variationUuid, variation] of Object.entries(variations)) {
            const result = await client.query(
                `INSERT INTO resume_variations (uuid, resume_id, name, bio, theme, spacing)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (uuid)
                 DO UPDATE SET name = $3, bio = $4, theme = $5, spacing = $6
                 RETURNING id`,
                [variationUuid, resumeId, variation.name, variation.bio, variation.theme || 'default', variation.spacing || 'normal']
            );
            const variationId = result.rows[0].id;

            // Update bullet point visibility
            if (variation.bulletPoints) {
                // First, remove old visibility entries
                await client.query(
                    'DELETE FROM bullet_point_visibility WHERE variation_id = $1',
                    [variationId]
                );

                // Then insert new ones
                const visibilityValues = variation.bulletPoints
                    .filter(bp => bp.bullet_point_id && bulletIdMap.has(bp.bullet_point_id))
                    .map(bp => `(${variationId}, ${bulletIdMap.get(bp.bullet_point_id)}, ${bp.is_visible})`);

                if (visibilityValues.length > 0) {
                    await client.query(
                        `INSERT INTO bullet_point_visibility 
                         (variation_id, bullet_point_id, is_visible) 
                         VALUES ${visibilityValues.join(',')}`
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Resume saved successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving resume:', error);
        res.status(500).json({ error: 'Failed to save resume data' });
    } finally {
        client.release();
    }
});

// Generate PDF using Puppeteer
app.post('/api/generate-pdf', async (req, res) => {
    let browser;
    try {
        const { html, theme, spacing } = req.body;

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

        // Inject the theme and spacing variables and styles
        await page.evaluate((theme, spacing) => {
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.setAttribute('data-spacing', spacing);

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
        }, theme, spacing);

        // Debug: Check if resume content exists and is styled
        const contentCheck = await page.evaluate(() => {
            const content = document.getElementById('resumeContent');
            if (!content) {
                return { success: false, error: 'Resume content not found' };
            }

            const styles = window.getComputedStyle(content);
            const headerColor = window.getComputedStyle(document.querySelector('.resume-header h1') || {}).color;
            const contentPadding = getComputedStyle(document.documentElement).getPropertyValue('--resume-content-padding').trim();

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
                spacingAttribute: document.documentElement.getAttribute('data-spacing'),
                contentPadding,
                allStyles,
                html: content.innerHTML
            };
        });

        if (!contentCheck.success) {
            throw new Error(contentCheck.error);
        }

        console.log('Content check results:', {
            theme: contentCheck.themeAttribute,
            spacing: contentCheck.spacingAttribute,
            padding: contentCheck.contentPadding
        });

        // Get the content padding value for margins
        const contentPadding = await page.evaluate(() => {
            return getComputedStyle(document.documentElement).getPropertyValue('--resume-content-padding').trim();
        });

        // Generate PDF with spacing-dependent margins and link handling
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: contentPadding,
                right: contentPadding,
                bottom: contentPadding,
                left: contentPadding
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

// Rename variation
app.put('/api/resume/:userId/variation/:variationUuid/rename', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId, variationUuid } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Get user's resume ID
        const resumeResult = await client.query(
            'SELECT r.id FROM resumes r JOIN users u ON r.user_id = u.id WHERE u.uuid = $1',
            [userId]
        );

        if (resumeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        const resumeId = resumeResult.rows[0].id;

        // Update variation name
        const result = await client.query(
            `UPDATE resume_variations 
             SET name = $1 
             WHERE uuid = $2 AND resume_id = $3
             RETURNING id`,
            [name, variationUuid, resumeId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Variation not found' });
        }

        res.json({ message: 'Variation renamed successfully' });
    } catch (error) {
        console.error('Error renaming variation:', error);
        res.status(500).json({ error: 'Failed to rename variation' });
    } finally {
        client.release();
    }
});

// Delete variation
app.delete('/api/resume/:userId/variation/:variationUuid', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId, variationUuid } = req.params;

        // Get user's resume ID
        const resumeResult = await client.query(
            'SELECT r.id FROM resumes r JOIN users u ON r.user_id = u.id WHERE u.uuid = $1',
            [userId]
        );

        if (resumeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        const resumeId = resumeResult.rows[0].id;

        // Count total variations
        const countResult = await client.query(
            'SELECT COUNT(*) FROM resume_variations WHERE resume_id = $1',
            [resumeId]
        );

        if (parseInt(countResult.rows[0].count) <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last variation' });
        }

        // Delete variation
        const result = await client.query(
            `DELETE FROM resume_variations 
             WHERE uuid = $1 AND resume_id = $2
             RETURNING id`,
            [variationUuid, resumeId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Variation not found' });
        }

        res.json({ message: 'Variation deleted successfully' });
    } catch (error) {
        console.error('Error deleting variation:', error);
        res.status(500).json({ error: 'Failed to delete variation' });
    } finally {
        client.release();
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});