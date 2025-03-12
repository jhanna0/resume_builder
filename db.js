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

console.log(process.env);  // This should output 'postgres' or whatever value you have in .env

pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch(err => {
        console.error('❌ PostgreSQL connection error:', err);
        process.exit(1);
    });

const initDB = async () => {
    // Create UUID extension if it doesn't exist
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS users_uuid_idx ON users(uuid);`;

    const createResumesTable = `
    CREATE TABLE IF NOT EXISTS resumes (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'Untitled Resume',
        full_name TEXT NOT NULL DEFAULT '',
        contact_info TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS resumes_uuid_idx ON resumes(uuid);`;

    const createResumeVariationsTable = `
    CREATE TABLE IF NOT EXISTS resume_variations (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Default Variation',
        bio TEXT DEFAULT '',
        theme TEXT DEFAULT 'default',
        spacing TEXT DEFAULT 'normal',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS resume_variations_uuid_idx ON resume_variations(uuid);`;

    const createSectionsTable = `
    CREATE TABLE IF NOT EXISTS sections (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sections_uuid_idx ON sections(uuid);`;

    const createJobsTable = `
    CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
        section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        company TEXT,
        start_date TEXT,
        end_date TEXT,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS jobs_uuid_idx ON jobs(uuid);`;

    const createBulletPointsTable = `
    CREATE TABLE IF NOT EXISTS bullet_points (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS bullet_points_uuid_idx ON bullet_points(uuid);`;

    const createBulletPointVisibilityTable = `
    CREATE TABLE IF NOT EXISTS bullet_point_visibility (
        variation_id INTEGER NOT NULL REFERENCES resume_variations(id) ON DELETE CASCADE,
        bullet_point_id INTEGER NOT NULL REFERENCES bullet_points(id) ON DELETE CASCADE,
        is_visible BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (variation_id, bullet_point_id)
    );`;

    try {
        await pool.query(createUsersTable);
        await pool.query(createResumesTable);
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
