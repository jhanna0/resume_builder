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

async function createDefaultVariation(userId, defaultVariationUuid, defaultSectionUuid) {
    // Get user's ID from UUID
    const userResult = await pool.query('SELECT id FROM users WHERE uuid = $1', [userId]);
    if (userResult.rows.length === 0) {
        throw new Error('User not found');
    }

    const userIdNum = userResult.rows[0].id;

    // Create default variation
    const newVariationResult = await pool.query(
        `INSERT INTO resume_variations (uuid, user_id, name, bio, theme, spacing, is_default) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, uuid`,
        [defaultVariationUuid, userIdNum, 'Original', '', 'default', 'normal', true]
    );

    // Create a default "Experience" section
    await pool.query(
        `INSERT INTO sections (uuid, user_id, name, order_index)
         VALUES ($1, $2, $3, $4)`,
        [defaultSectionUuid, userIdNum, 'Experience', 0]
    );

    return newVariationResult.rows[0];
}

async function updateUserInfo(client, userId, fullName, contactInfo) {
    if (fullName || contactInfo) {
        await client.query(
            `UPDATE users 
             SET full_name = COALESCE(NULLIF($1, ''), full_name),
                 contact_info = COALESCE(NULLIF($2, ''), contact_info)
             WHERE id = $3`,
            [fullName, contactInfo, userId]
        );
    }
}

async function createNewVariation(client, userId, variation) {
    const variationResult = await client.query(
        `INSERT INTO resume_variations (uuid, user_id, name, bio, theme, spacing, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         RETURNING id`,
        [variation.uuid, userId, variation.name,
        variation.bio || '', variation.theme || 'default',
        variation.spacing || 'normal']
    );
    return variationResult.rows[0].id;
}

async function getExistingVariationIds(client, userId, currentVariationId) {
    const existingVariationsResult = await client.query(
        `SELECT id FROM resume_variations WHERE user_id = $1 AND id != $2`,
        [userId, currentVariationId]
    );
    return existingVariationsResult.rows.map(row => row.id);
}

async function createSection(client, userId, section) {
    const newSectionResult = await client.query(
        `INSERT INTO sections (uuid, user_id, name, order_index)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (uuid) 
         DO UPDATE SET name = $3, order_index = $4
         RETURNING id`,
        [section.id, userId, section.name, section.order_index]
    );
    return newSectionResult.rows[0].id;
}

async function createJob(client, sectionId, userId, job) {
    const jobResult = await client.query(
        `INSERT INTO jobs (uuid, section_id, user_id, title, company, start_date, end_date, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (uuid) 
         DO UPDATE SET section_id = $2, title = $4, company = $5, 
                      start_date = $6, end_date = $7, order_index = $8
         RETURNING id`,
        [job.id, sectionId, userId, job.title, job.company,
        job.start_date, job.end_date, job.order_index]
    );
    return jobResult.rows[0].id;
}

async function createBulletPoint(client, jobId, userId, bullet) {
    const bulletResult = await client.query(
        `INSERT INTO bullet_points (uuid, job_id, user_id, content, order_index)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (uuid) 
         DO UPDATE SET job_id = $2, content = $4, order_index = $5
         RETURNING id`,
        [bullet.id, jobId, userId, bullet.content, bullet.order_index]
    );
    return bulletResult.rows[0].id;
}

async function setBulletPointVisibility(client, variationId, bulletId, userId, isVisible) {
    await client.query(
        `INSERT INTO bullet_point_visibility (variation_id, bullet_point_id, user_id, is_visible)
         VALUES ($1, $2, $3, $4)`,
        [variationId, bulletId, userId, isVisible]
    );
}

async function setBulletPointVisibilityForExistingVariations(client, bulletId, userId, existingVariationIds, currentVariationId) {
    if (existingVariationIds.length > 0) {
        await client.query(
            `INSERT INTO bullet_point_visibility (variation_id, bullet_point_id, user_id, is_visible)
             SELECT v.id, $1, $2, false
             FROM UNNEST($3::int[]) AS v(id)
             WHERE v.id != $4`,
            [bulletId, userId, existingVariationIds, currentVariationId]
        );
    }
}

async function processSection(client, userId, section, existingVariation, variationId, existingVariationIds, variation) {
    console.log('\n=== Processing Section ===');
    console.log('Section:', section);
    console.log('Variation:', variation);
    console.log('Existing Variation:', existingVariation);

    // Always create/update the section
    console.log('Creating/updating section...');
    const newSectionId = await createSection(client, userId, section);
    const sectionJobs = existingVariation.jobs.filter(j => j.section_id === section.id);
    console.log('Section jobs:', sectionJobs);

    for (const job of sectionJobs) {
        console.log('\n--- Processing Job ---');
        console.log('Job:', job);
        const jobId = await createJob(client, newSectionId, userId, job);
        const jobBullets = existingVariation.bulletPoints.filter(bp => bp.job_id === job.id);
        console.log('Job bullets:', jobBullets);

        for (const bullet of jobBullets) {
            console.log('\n*** Processing Bullet ***');
            console.log('Bullet:', bullet);
            const bulletId = await createBulletPoint(client, jobId, userId, bullet);
            console.log('Created/updated bullet with ID:', bulletId);
        }
    }
}

async function processBulletPoints(client, variationId, userId, variation, existingVariation) {
    console.log('\n=== Processing Bullet Points ===');
    console.log('Variation:', variation);
    console.log('Existing Variation:', existingVariation);

    if (variation.bulletPoints) {
        for (const bp of variation.bulletPoints) {
            console.log('\n--- Processing Bullet Point ---');
            console.log('Bullet Point:', bp);

            const bulletResult = await client.query(
                `SELECT id FROM bullet_points WHERE uuid = $1`,
                [bp.bullet_point_id]
            );

            if (bulletResult.rows.length > 0) {
                console.log('Found bullet point in database:', bulletResult.rows[0]);
                await client.query(
                    `INSERT INTO bullet_point_visibility (variation_id, bullet_point_id, user_id, is_visible)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (variation_id, bullet_point_id) 
                     DO UPDATE SET is_visible = $4`,
                    [variationId, bulletResult.rows[0].id, userId, bp.is_visible]
                );
                console.log('Updated visibility to:', bp.is_visible);
            } else {
                console.log('Bullet point not found in database:', bp.bullet_point_id);
            }
        }
    } else {
        console.log('No bullet points to process');
    }
}

async function processVariation(client, userId, variation, existingVariation) {
    console.log('\n=== Processing Variation ===');
    console.log('Variation:', variation);
    console.log('Existing Variation:', existingVariation);

    // Ensure we have a UUID for the variation
    if (!variation.uuid) {
        console.error('No UUID provided for variation:', variation);
        throw new Error('Variation UUID is required');
    }

    const variationId = await createNewVariation(client, userId, variation);
    console.log('Created new variation with ID:', variationId);

    const existingVariationIds = await getExistingVariationIds(client, userId, variationId);
    console.log('Existing variation IDs:', existingVariationIds);

    // First create all sections, jobs, and bullet points
    if (existingVariation.sections) {
        for (const section of existingVariation.sections) {
            await processSection(client, userId, section, existingVariation, variationId, existingVariationIds, variation);
        }
    }

    // Then process bullet point visibility after all bullet points exist
    await processBulletPoints(client, variationId, userId, variation, existingVariation);
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
        const { email, password, existingVariation } = req.body;

        console.log('Login request received:', { email, password, existingVariation });

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Get user (case-insensitive email comparison)
        const userResult = await client.query(
            'SELECT id, uuid, password_hash, full_name, contact_info FROM users WHERE LOWER(email) = LOWER($1)',
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

        // If we have existing variations, merge them with the user's variations
        if (existingVariation) {
            await client.query('BEGIN');

            try {
                await updateUserInfo(client, user.id, existingVariation.full_name, existingVariation.contact_info);

                // Process each variation from the existing data
                for (const [variationUuid, variation] of Object.entries(existingVariation.variations)) {
                    // Ensure the variation has the correct UUID
                    variation.uuid = variationUuid;
                    await processVariation(client, user.id, variation, existingVariation);
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                console.error('Error importing variations:', error);
                return res.status(500).json({
                    error: 'Failed to import resume variations',
                    details: error.message,
                    userId: user.uuid
                });
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
    const client = await pool.connect();
    try {
        const { userId } = req.params;

        // Get user info
        const userResult = await client.query(
            'SELECT id, full_name, contact_info FROM users WHERE uuid = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Get all variations for the user
        const variationsResult = await client.query(
            'SELECT id, uuid, name, bio, theme, spacing, is_default FROM resume_variations WHERE user_id = $1 ORDER BY id DESC',
            [user.id]
        );

        // If no variations exist, create a default one
        if (variationsResult.rows.length === 0) {
            // Generate default UUIDs
            const defaultVariationUuid = uuidv4();
            const defaultSectionUuid = uuidv4();
            const defaultVariation = await createDefaultVariation(userId, defaultVariationUuid, defaultSectionUuid);
            variationsResult.rows = [defaultVariation];
        }

        // Get all sections for the user
        const sectionsResult = await client.query(
            `SELECT s.id, s.uuid, s.name, s.order_index 
             FROM sections s
             WHERE s.user_id = $1 
             ORDER BY s.order_index ASC`,
            [user.id]
        );

        // Get all jobs for all sections
        const jobsResult = await client.query(
            `SELECT j.id, j.uuid, j.section_id, j.title, j.company, j.start_date, j.end_date, j.order_index 
             FROM jobs j
             JOIN sections s ON j.section_id = s.id
             WHERE s.user_id = $1 
             ORDER BY j.order_index ASC`,
            [user.id]
        );

        // Get all bullet points for all jobs
        const bulletPointsResult = await client.query(
            `SELECT bp.id, bp.uuid, bp.job_id, bp.content, bp.order_index 
             FROM bullet_points bp
             JOIN jobs j ON bp.job_id = j.id
             JOIN sections s ON j.section_id = s.id
             WHERE s.user_id = $1 
             ORDER BY bp.order_index ASC`,
            [user.id]
        );

        // Get bullet point visibility for all variations
        const visibilityResult = await client.query(
            `SELECT bpv.variation_id, bpv.bullet_point_id, bpv.is_visible
             FROM bullet_point_visibility bpv
             JOIN resume_variations rv ON bpv.variation_id = rv.id
             WHERE rv.user_id = $1`,
            [user.id]
        );

        // Structure the response
        const response = {
            full_name: user.full_name,
            contact_info: user.contact_info,
            sections: sectionsResult.rows.map(s => ({
                ...s,
                id: s.uuid
            })),
            jobs: jobsResult.rows.map(j => ({
                ...j,
                id: j.uuid,
                section_id: sectionsResult.rows.find(s => s.id === j.section_id)?.uuid
            })),
            bulletPoints: bulletPointsResult.rows.map(bp => ({
                ...bp,
                id: bp.uuid,
                job_id: jobsResult.rows.find(j => j.id === bp.job_id)?.uuid
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

                acc[variation.uuid] = {
                    id: variation.uuid,
                    name: variation.name,
                    bio: variation.bio,
                    theme: variation.theme,
                    spacing: variation.spacing,
                    is_default: variation.is_default,
                    bulletPoints: bulletPointsResult.rows.map(bp => ({
                        bullet_point_id: bp.uuid,
                        is_visible: visibilityMap[bp.uuid] ?? false
                    }))
                };
                return acc;
            }, {})
        };

        res.json(response);
    } catch (error) {
        console.error('Error loading resume:', error);
        res.status(500).json({ error: 'Failed to load resume data', details: error.message });
    } finally {
        client.release();
    }
});

// Save resume data
app.post('/api/resume/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;
        const { full_name, contact_info, sections, jobs, bulletPoints, variations } = req.body;

        console.log('Saving resume data:', req.body);

        await client.query('BEGIN');

        // Get user's ID from UUID
        const userResult = await client.query('SELECT id FROM users WHERE uuid = $1', [userId]);
        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }
        const userIdNum = userResult.rows[0].id;

        // Update user's personal info
        await client.query(
            `UPDATE users 
             SET full_name = $1, contact_info = $2
             WHERE id = $3`,
            [full_name, contact_info, userIdNum]
        );

        // Get existing items to determine what to delete
        const existingSections = await client.query(
            'SELECT id, uuid FROM sections WHERE user_id = $1',
            [userIdNum]
        );
        const existingJobs = await client.query(
            `SELECT j.id, j.uuid 
             FROM jobs j 
             JOIN sections s ON j.section_id = s.id 
             WHERE s.user_id = $1`,
            [userIdNum]
        );
        const existingBullets = await client.query(
            `SELECT bp.id, bp.uuid 
             FROM bullet_points bp 
             JOIN jobs j ON bp.job_id = j.id 
             JOIN sections s ON j.section_id = s.id 
             WHERE s.user_id = $1`,
            [userIdNum]
        );

        // Create maps for looking up internal IDs
        const sectionIdMap = new Map(existingSections.rows.map(s => [s.uuid, s.id]));
        const jobIdMap = new Map(existingJobs.rows.map(j => [j.uuid, j.id]));
        const bulletIdMap = new Map(existingBullets.rows.map(b => [b.uuid, b.id]));
        const variationIdMap = new Map();

        // Delete items that are no longer present
        const keepSectionUuids = new Set(sections.map(s => s.id));
        const keepJobUuids = new Set(jobs.map(j => j.id));
        const keepBulletUuids = new Set(bulletPoints.map(b => b.id));

        // First, delete bullet point visibility records for bullets that will be deleted
        const bulletIdsToDelete = existingBullets.rows
            .filter(bullet => !keepBulletUuids.has(bullet.uuid))
            .map(bullet => bullet.id);

        if (bulletIdsToDelete.length > 0) {
            console.log('Deleting visibility records for bullet points:', bulletIdsToDelete);
            await client.query(
                'DELETE FROM bullet_point_visibility WHERE bullet_point_id = ANY($1)',
                [bulletIdsToDelete]
            );
        }

        // Then delete the actual items
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

        // Handle variations first
        for (const [variationUuid, variation] of Object.entries(variations)) {
            // Filter out bullet points that no longer exist from the variation's bulletPoints array
            if (variation.bulletPoints) {
                variation.bulletPoints = variation.bulletPoints.filter(bp =>
                    bulletPoints.some(bullet => bullet.id === bp.bullet_point_id)
                );
            }

            const result = await client.query(
                `INSERT INTO resume_variations (uuid, user_id, name, bio, theme, spacing, is_default)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (uuid)
                 DO UPDATE SET name = $3, bio = $4, theme = $5, spacing = $6, is_default = $7
                 RETURNING id`,
                [variationUuid, userIdNum, variation.name, variation.bio,
                    variation.theme || 'default', variation.spacing || 'normal',
                    variation.is_default || false]
            );
            variationIdMap.set(variationUuid, result.rows[0].id);
        }

        // Insert or update sections
        for (const section of sections) {
            const result = await client.query(
                `INSERT INTO sections (uuid, user_id, name, order_index) 
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (uuid) 
                 DO UPDATE SET name = $3, order_index = $4
                 RETURNING id`,
                [section.id, userIdNum, section.name, section.order_index]
            );
            sectionIdMap.set(section.id, result.rows[0].id);
        }

        // Insert or update jobs
        for (const job of jobs) {
            const sectionId = sectionIdMap.get(job.section_id);
            if (!sectionId) continue;

            const result = await client.query(
                `INSERT INTO jobs 
                 (uuid, user_id, section_id, title, company, start_date, end_date, order_index) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (uuid)
                 DO UPDATE SET section_id = $3, title = $4, company = $5, 
                             start_date = $6, end_date = $7, order_index = $8
                 RETURNING id`,
                [job.id, userIdNum, sectionId, job.title, job.company,
                job.start_date, job.end_date, job.order_index]
            );
            jobIdMap.set(job.id, result.rows[0].id);
        }

        // Insert or update bullet points
        for (const bullet of bulletPoints) {
            const jobId = jobIdMap.get(bullet.job_id);
            if (!jobId) continue;

            const result = await client.query(
                `INSERT INTO bullet_points (uuid, user_id, job_id, content, order_index) 
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (uuid)
                 DO UPDATE SET content = $4, order_index = $5
                 RETURNING id`,
                [bullet.id, userIdNum, jobId, bullet.content, bullet.order_index]
            );
            bulletIdMap.set(bullet.id, result.rows[0].id);
        }

        // Update bullet point visibility
        for (const [variationUuid, variation] of Object.entries(variations)) {
            const variationId = variationIdMap.get(variationUuid);
            console.log('\n--- Processing variation:', {
                variationUuid,
                variationId,
                variationName: variation.name,
                bulletPointsCount: variation.bulletPoints?.length
            });

            if (!variationId || !variation.bulletPoints) {
                console.log('Skipping variation - invalid data');
                continue;
            }

            // First delete all existing visibility entries for this variation
            await client.query(
                'DELETE FROM bullet_point_visibility WHERE variation_id = $1',
                [variationId]
            );

            console.log('\nBullet points in variation:', variation.bulletPoints);
            console.log('\nBulletIdMap contents:', Object.fromEntries(bulletIdMap));

            // Verify which bullet points exist in the database
            const bulletIds = variation.bulletPoints
                .map(bp => bulletIdMap.get(bp.bullet_point_id))
                .filter(id => id !== undefined);

            const existingBulletIds = await client.query(
                'SELECT id FROM bullet_points WHERE id = ANY($1)',
                [bulletIds]
            );

            const validBulletIds = new Set(existingBulletIds.rows.map(row => row.id));

            console.log('\nValid bullet IDs in database:', Array.from(validBulletIds));

            // Then insert new visibility entries only for bullet points that exist in the database
            const visibilityValues = variation.bulletPoints
                .filter(bp => {
                    console.log('\nProcessing bullet point:', bp);

                    if (!bp.bullet_point_id) {
                        console.log('❌ Missing bullet_point_id:', bp);
                        return false;
                    }
                    const mappedId = bulletIdMap.get(bp.bullet_point_id);
                    if (!mappedId) {
                        console.log('❌ Bullet point not found in map:', {
                            bullet_point_id: bp.bullet_point_id,
                            availableIds: Array.from(bulletIdMap.keys())
                        });
                        return false;
                    }
                    if (!validBulletIds.has(mappedId)) {
                        console.log('❌ Bullet point does not exist in database:', {
                            bullet_point_id: bp.bullet_point_id,
                            mapped_id: mappedId
                        });
                        return false;
                    }
                    console.log('✅ Bullet point valid');
                    return true;
                })
                .map(bp => {
                    const bulletId = bulletIdMap.get(bp.bullet_point_id);
                    console.log('Mapping bullet point:', {
                        original_id: bp.bullet_point_id,
                        mapped_id: bulletId,
                        is_visible: bp.is_visible
                    });
                    return {
                        variationId,
                        bulletId,
                        userId: userIdNum,
                        isVisible: bp.is_visible
                    };
                });

            console.log('\nFinal visibility values:', visibilityValues);

            if (visibilityValues.length > 0) {
                const params = [
                    visibilityValues.map(v => v.variationId),
                    visibilityValues.map(v => v.bulletId),
                    visibilityValues.map(v => v.userId),
                    visibilityValues.map(v => v.isVisible)
                ];
                console.log('\nInserting with params:', params);

                // Use parameterized query instead of string concatenation
                await client.query(
                    `INSERT INTO bullet_point_visibility 
                     (variation_id, bullet_point_id, user_id, is_visible)
                     SELECT * FROM UNNEST ($1::int[], $2::int[], $3::int[], $4::boolean[])`,
                    params
                );
            } else {
                console.log('No valid visibility values to insert');
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Resume saved successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving resume:', error);
        res.status(500).json({ error: 'Failed to save resume data', details: error.message });
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

        // Get user's ID from UUID
        const userResult = await client.query('SELECT id FROM users WHERE uuid = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const userIdNum = userResult.rows[0].id;

        // Update variation name
        const result = await client.query(
            `UPDATE resume_variations 
             SET name = $1 
             WHERE uuid = $2 AND user_id = $3
             RETURNING id`,
            [name, variationUuid, userIdNum]
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

        // Get user's ID from UUID
        const userResult = await client.query('SELECT id FROM users WHERE uuid = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const userIdNum = userResult.rows[0].id;

        // Count total variations
        const countResult = await client.query(
            'SELECT COUNT(*) FROM resume_variations WHERE user_id = $1',
            [userIdNum]
        );

        if (parseInt(countResult.rows[0].count) <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last variation' });
        }

        // Delete variation
        const result = await client.query(
            `DELETE FROM resume_variations 
             WHERE uuid = $1 AND user_id = $2
             RETURNING id`,
            [variationUuid, userIdNum]
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