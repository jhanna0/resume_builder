import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
    user: process.env.USER_DB || 'postgres',
    host: process.env.HOST_DB || 'localhost',
    database: process.env.DB_DB || 'resume_db',
    password: process.env.PASSWORD_DB || 'password',
    port: process.env.PORT_DB || 5432,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch(err => {
        console.error('❌ PostgreSQL connection error:', err);
        process.exit(1);
    });

const initDB = async () => {
    // Create UUID extension if it doesn't exist
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    // Drop existing tables in reverse order of dependencies
    // await pool.query(`
    //     DROP TABLE IF EXISTS bullet_point_visibility CASCADE;
    //     DROP TABLE IF EXISTS bullet_points CASCADE;
    //     DROP TABLE IF EXISTS jobs CASCADE;
    //     DROP TABLE IF EXISTS sections CASCADE;
    //     DROP TABLE IF EXISTS resume_variations CASCADE;
    //     DROP TABLE IF EXISTS users CASCADE;
    // `);

    const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        contact_info TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users(LOWER(email));
    CREATE INDEX IF NOT EXISTS users_uuid_idx ON users(uuid);`;

    const createResumeVariationsTable = `
    CREATE TABLE IF NOT EXISTS resume_variations (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Default Variation',
        bio TEXT DEFAULT '',
        theme TEXT DEFAULT 'default',
        spacing TEXT DEFAULT 'normal',
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS resume_variations_uuid_idx ON resume_variations(uuid);
    CREATE INDEX IF NOT EXISTS resume_variations_user_id_idx ON resume_variations(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS resume_variations_user_default_idx ON resume_variations(user_id, is_default) WHERE is_default = true;`;

    const createSectionsTable = `
    CREATE TABLE IF NOT EXISTS sections (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sections_uuid_idx ON sections(uuid);
    CREATE INDEX IF NOT EXISTS sections_user_id_idx ON sections(user_id);`;

    const createJobsTable = `
    CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        company TEXT,
        start_date TEXT,
        end_date TEXT,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS jobs_uuid_idx ON jobs(uuid);
    CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS jobs_section_id_idx ON jobs(section_id);`;

    const createBulletPointsTable = `
    CREATE TABLE IF NOT EXISTS bullet_points (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS bullet_points_uuid_idx ON bullet_points(uuid);
    CREATE INDEX IF NOT EXISTS bullet_points_user_id_idx ON bullet_points(user_id);
    CREATE INDEX IF NOT EXISTS bullet_points_job_id_idx ON bullet_points(job_id);`;

    const createBulletPointVisibilityTable = `
    CREATE TABLE IF NOT EXISTS bullet_point_visibility (
        variation_id INTEGER NOT NULL REFERENCES resume_variations(id) ON DELETE CASCADE,
        bullet_point_id INTEGER NOT NULL REFERENCES bullet_points(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_visible BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (variation_id, bullet_point_id)
    );
    CREATE INDEX IF NOT EXISTS bullet_point_visibility_variation_id_idx ON bullet_point_visibility(variation_id);
    CREATE INDEX IF NOT EXISTS bullet_point_visibility_user_id_idx ON bullet_point_visibility(user_id);`;

    try {
        await pool.query(createUsersTable);
        await pool.query(createResumeVariationsTable);
        await pool.query(createSectionsTable);
        await pool.query(createJobsTable);
        await pool.query(createBulletPointsTable);
        await pool.query(createBulletPointVisibilityTable);
        console.log('✅ Database initialized.');
    } catch (err) {
        console.error('❌ Error initializing database:', err);
    }
};

initDB();

export default pool;
