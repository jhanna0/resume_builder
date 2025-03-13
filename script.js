import { v4 as uuidv4 } from 'https://cdn.jsdelivr.net/npm/uuid@9.0.1/+esm';

// DO NOT DELETE ANYTHING FROM THIS FILE UNLESS YOU EXPLICITLY ARE TOLD TO DO SO

// Dynamically load the resume section only
function loadComponent(targetId, url) {
    fetch(url)
        .then(resp => resp.text())
        .then(html => {
            document.getElementById(targetId).innerHTML = html;
            // Initialize auth UI after resume component is loaded
            updateAuthUI();
        })
        .catch(err => console.error(`Failed to load ${url}:`, err));
}

// Load resume component
loadComponent("resume", "resume.html");

// Global state
let state = {
    userId: localStorage.getItem('userId'),  // Load from localStorage
    currentResume: null,
    currentVariation: null,
    variations: {},
    isDirty: false,
    isAuthenticated: Boolean(localStorage.getItem('userId'))  // Set based on userId presence
};

// Add at the top with other global state
let hasUnsavedChanges = false;
let currentSpacing = 'normal';

// Auth Modal
const authModal = document.getElementById('authModal');
const closeBtn = document.querySelector('.close');
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');

// Make necessary functions available globally
window.addJob = addJob;
window.addBulletPoint = addBulletPoint;
window.moveJob = moveJob;
window.moveBullet = moveBullet;
window.duplicateBullet = duplicateBullet;
window.deleteBullet = deleteBullet;
window.deleteJob = deleteJob;
window.updateResume = updateResume;
window.autoResizeTextarea = autoResizeTextarea;
window.login = login;
window.signup = signup;
window.loadResume = loadResume;
window.changeTheme = changeTheme;
window.changeSpacing = changeSpacing;
window.exportToPDF = exportToPDF;
window.addSection = addSection;
window.saveResume = saveResume;
window.createNewVariation = createNewVariation;
window.loadVariation = loadVariation;
window.moveSection = moveSection;
window.renameVariation = renameVariation;
window.deleteVariation = deleteVariation;
window.showAuthModal = showAuthModal;
window.signOut = signOut;

// Utility function to generate unique IDs
function generateId() {
    return uuidv4();
}

// Utility function to normalize order indices
function normalizeOrderIndices(items) {
    return items.sort((a, b) => a.order_index - b.order_index)
        .map((item, index) => {
            item.order_index = index;
            return item;
        });
}

function createNewVariation() {
    const name = prompt('Enter a name for the new variation (e.g., "Apple UI", "Meta UI"):');
    if (!name) return;

    const variationId = generateId();
    const currentVar = state.variations[state.currentVariation];

    // Clone current variation's structure and visibility states
    state.variations[variationId] = {
        id: variationId,
        name: name,
        bio: currentVar?.bio || '',
        theme: currentVar?.theme || 'default',
        spacing: currentVar?.spacing || 'normal',
        bulletPoints: currentVar ? currentVar.bulletPoints.map(bp => ({
            bullet_point_id: bp.bullet_point_id,
            is_visible: bp.is_visible
        })) : []
    };

    // Add to dropdown
    const option = document.createElement('option');
    option.value = variationId;
    option.textContent = name;
    document.getElementById('variationSelect').appendChild(option);

    // Switch to new variation
    document.getElementById('variationSelect').value = variationId;
    loadVariation(variationId);
    markUnsavedChanges();
}

function addSection(sectionData = null) {
    const name = sectionData?.name || prompt('Enter section name (e.g., "Experience", "Education"):');
    if (!name) return;

    const sectionId = sectionData?.id || generateId();

    // Get max order_index and add 1, or 0 if no sections exist
    const maxOrderIndex = state.currentResume.sections.length > 0
        ? Math.max(...state.currentResume.sections.map(s => s.order_index))
        : -1;

    const section = {
        id: sectionId,
        name: name,
        order_index: sectionData?.order_index ?? (maxOrderIndex + 1)
    };

    // Add to state
    state.currentResume.sections.push(section);

    // Normalize all section indices to ensure they're continuous
    state.currentResume.sections = normalizeOrderIndices(state.currentResume.sections);

    // Create section UI
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'section';
    sectionDiv.dataset.sectionId = sectionId;

    sectionDiv.innerHTML = `
        <div class="section-header">
            <input type="text" class="section-name" value="${name}" placeholder="Section Name">
        </div>
        <div class="section-controls">
            <button onclick="addJob(null, false, '${sectionId}')" class="add-job-btn" title="Add Job">Add Job</button>
            <div class="move-buttons">
                <button onclick="moveSection(this, 'up')" title="Move Up">↑</button>
                <button onclick="moveSection(this, 'down')" title="Move Down">↓</button>
            </div>
            <button onclick="deleteSection(this)" class="delete-section" title="Delete Section">×</button>
        </div>
        <div class="section-jobs"></div>
    `;

    // Add event listeners
    const nameInput = sectionDiv.querySelector('.section-name');
    nameInput.addEventListener('input', () => {
        section.name = nameInput.value;
        updateResume();
    });

    // Add to container
    const container = document.getElementById('sectionsContainer');
    container.appendChild(sectionDiv);

    // If this is a new section, mark changes and scroll to it
    if (!sectionData) {
        markUnsavedChanges();
        sectionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return section;
}

// Helper function to check if a job is empty
function isJobEmpty(job) {
    // Check if job has no title and no bullet points
    const hasTitle = job.title && job.title.trim().length > 0;
    const hasBullets = state.currentResume.bulletPoints.some(bp =>
        bp.job_id === job.id && bp.content && bp.content.trim().length > 0
    );
    return !hasTitle && !hasBullets;
}

// Update saveResume function to filter out empty jobs
async function saveResume() {
    // Filter out empty jobs before saving
    const nonEmptyJobs = state.currentResume.jobs.filter(job => !isJobEmpty(job));

    // If jobs were filtered out, update the state
    if (nonEmptyJobs.length !== state.currentResume.jobs.length) {
        state.currentResume.jobs = nonEmptyJobs;
        // Also remove bullet points for removed jobs
        state.currentResume.bulletPoints = state.currentResume.bulletPoints.filter(bp =>
            nonEmptyJobs.some(job => job.id === bp.job_id)
        );
        // Update UI to reflect removed jobs
        updateUI();
    }

    try {
        const response = await fetch(`/api/resume/${state.userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: state.currentResume.id,
                title: state.currentResume.title,
                full_name: document.getElementById('name').value,
                contact_info: document.getElementById('contact').value,
                sections: state.currentResume.sections,
                jobs: state.currentResume.jobs,
                bulletPoints: state.currentResume.bulletPoints,
                variations: state.variations
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save resume');
        }

        clearUnsavedChanges();
        alert('Resume saved successfully!');
    } catch (error) {
        console.error('Error saving resume:', error);
        alert(`Failed to save resume: ${error.message}`);
    }
}

// Update addJob to prevent creating empty jobs if there's already an empty one in the section
function addJob(jobData = null, skipStateUpdate = false, targetSectionId = null) {
    // If no sections exist, create one
    if (state.currentResume.sections.length === 0) {
        addSection({ name: 'Experience', order_index: 0 });
    }

    // Use provided targetSectionId or get from jobData
    if (!targetSectionId) {
        targetSectionId = jobData?.section_id || state.currentResume.sections[0].id;
    }

    // Check if there's already an empty job in this section
    if (!jobData) {
        const sectionJobs = state.currentResume.jobs.filter(j => j.section_id === targetSectionId);
        const hasEmptyJob = sectionJobs.some(isJobEmpty);
        if (hasEmptyJob) {
            alert('Please fill out the existing empty job before adding a new one.');
            // Find and focus the empty job's title input
            const emptyJob = sectionJobs.find(isJobEmpty);
            if (emptyJob) {
                const emptyJobDiv = document.querySelector(`.job[data-job-id="${emptyJob.id}"]`);
                if (emptyJobDiv) {
                    const titleInput = emptyJobDiv.querySelector('.job-title');
                    titleInput.focus();
                    emptyJobDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            return null;
        }
    }

    // Get max order_index for jobs in this section and add 1, or 0 if no jobs exist
    const sectionJobs = state.currentResume.jobs.filter(j => j.section_id === targetSectionId);
    const maxOrderIndex = sectionJobs.length > 0
        ? Math.max(...sectionJobs.map(j => j.order_index))
        : -1;

    const jobId = jobData?.id || generateId();
    const job = {
        id: jobId,
        section_id: targetSectionId,
        title: jobData?.title || '',
        company: jobData?.company || '',
        start_date: jobData?.start_date || null,
        end_date: jobData?.end_date || null,
        order_index: jobData?.order_index ?? (maxOrderIndex + 1)
    };

    // Only update state if this is a new job and we're not skipping state update
    if (!skipStateUpdate && !state.currentResume.jobs.find(j => j.id === jobId)) {
        state.currentResume.jobs.push(job);
        // Normalize order indices for all jobs in this section
        const sectionJobs = state.currentResume.jobs.filter(j => j.section_id === targetSectionId);
        normalizeOrderIndices(sectionJobs);
    }

    // Create job UI
    const template = document.getElementById('job-template');
    const jobDiv = template.content.cloneNode(true).firstElementChild;
    jobDiv.dataset.jobId = jobId;

    // Set job details
    const titleInput = jobDiv.querySelector('.job-title');
    titleInput.value = job.title;
    titleInput.addEventListener('input', () => {
        const existingJob = state.currentResume.jobs.find(j => j.id === jobId);
        if (existingJob) {
            existingJob.title = titleInput.value;
        }
        updateResume();
    });

    // Set company
    const companyInput = jobDiv.querySelector('.job-company');
    companyInput.value = job.company || '';
    companyInput.addEventListener('input', () => {
        const existingJob = state.currentResume.jobs.find(j => j.id === jobId);
        if (existingJob) {
            existingJob.company = companyInput.value;
        }
        updateResume();
    });

    // Set dates
    const startDateInput = jobDiv.querySelector('.job-start-date');
    const endDateInput = jobDiv.querySelector('.job-end-date');

    startDateInput.value = job.start_date || '';
    endDateInput.value = job.end_date || '';

    startDateInput.addEventListener('input', () => {
        const existingJob = state.currentResume.jobs.find(j => j.id === jobId);
        if (existingJob) {
            existingJob.start_date = startDateInput.value;
        }
        updateResume();
    });

    endDateInput.addEventListener('input', () => {
        const existingJob = state.currentResume.jobs.find(j => j.id === jobId);
        if (existingJob) {
            existingJob.end_date = endDateInput.value;
        }
        updateResume();
    });

    // Find the correct section's jobs container
    const sectionDiv = document.querySelector(`.section[data-section-id="${job.section_id}"]`);
    const jobsContainer = sectionDiv.querySelector('.section-jobs');

    // Add to container at the end (append) instead of the beginning
    jobsContainer.appendChild(jobDiv);

    // If this is a new job, mark changes and scroll to it
    if (!jobData && !skipStateUpdate) {
        markUnsavedChanges();
        jobDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Focus the title input
        titleInput.focus();
    }

    return jobDiv;
}

// Update autoResizeTextarea function to be more robust
function autoResizeTextarea(textarea) {
    if (!textarea) return;

    // Reset height to auto first to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set the height to match content
    textarea.style.height = (textarea.scrollHeight) + 'px';
}

// Add function to resize all textareas in a container
function autoResizeAllTextareas(container = document) {
    const textareas = container.querySelectorAll('textarea');
    textareas.forEach(autoResizeTextarea);
}

// Update addBulletPoint to ensure textarea is resized
function addBulletPoint(containerOrButton, bulletData = null, skipStateUpdate = false) {
    let bulletContainer;
    if (containerOrButton.tagName === "BUTTON") {
        bulletContainer = containerOrButton.closest('.job-content').querySelector('.bulletPointsContainer');
    } else {
        bulletContainer = containerOrButton;
    }

    const jobId = bulletContainer.closest('.job').dataset.jobId;
    const bulletId = bulletData?.id || generateId();

    // Get max order_index for bullets in this job and add 1, or 0 if no bullets exist
    const jobBullets = state.currentResume.bulletPoints.filter(b => b.job_id === jobId);
    const maxOrderIndex = jobBullets.length > 0
        ? Math.max(...jobBullets.map(b => b.order_index))
        : -1;

    // Create bullet point data
    const bullet = {
        id: bulletId,
        job_id: jobId,
        content: bulletData?.content || '',
        order_index: bulletData?.order_index ?? (maxOrderIndex + 1)
    };

    // Only update state if this is a new bullet and we're not skipping state update
    if (!skipStateUpdate && !state.currentResume.bulletPoints.find(b => b.id === bulletId)) {
        state.currentResume.bulletPoints.push(bullet);
        // Normalize order indices for all bullets in this job
        const jobBullets = state.currentResume.bulletPoints.filter(b => b.job_id === jobId);
        normalizeOrderIndices(jobBullets);

        // Set visibility for variations
        Object.entries(state.variations).forEach(([variationId, variation]) => {
            if (!variation.bulletPoints) {
                variation.bulletPoints = [];
            }
            // Only set visible in current variation
            variation.bulletPoints.push({
                bullet_point_id: bulletId,
                is_visible: variationId === state.currentVariation
            });
        });
    }

    // Create bullet point UI
    const template = document.getElementById('bullet-template');
    const bulletDiv = template.content.cloneNode(true).firstElementChild;
    bulletDiv.dataset.bulletId = bulletId;

    const textArea = bulletDiv.querySelector('textarea');
    const checkbox = bulletDiv.querySelector('input[type="checkbox"]');

    textArea.value = bullet.content;
    // Set checkbox based on current variation visibility
    checkbox.checked = state.currentVariation === state.currentVariation;

    // Add event listeners
    textArea.addEventListener('input', () => {
        const existingBullet = state.currentResume.bulletPoints.find(b => b.id === bulletId);
        if (existingBullet) {
            existingBullet.content = textArea.value;
        }
        autoResizeTextarea(textArea);
        updateResume();
    });

    checkbox.addEventListener('change', () => {
        if (state.currentVariation) {
            const variation = state.variations[state.currentVariation];
            const bulletPoint = variation.bulletPoints.find(bp => bp.bullet_point_id === bulletId);
            if (bulletPoint) {
                bulletPoint.is_visible = checkbox.checked;
            } else {
                variation.bulletPoints.push({
                    bullet_point_id: bulletId,
                    is_visible: checkbox.checked
                });
            }
        }
        updateResume();
    });

    // Add to container at the end instead of the beginning
    bulletContainer.appendChild(bulletDiv);

    // Ensure textarea is properly sized
    autoResizeTextarea(textArea);

    // If this is a new bullet point, mark changes and scroll to it
    if (!bulletData && !skipStateUpdate) {
        markUnsavedChanges();
        bulletDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Focus the textarea
        textArea.focus();
    }

    return bulletDiv;
}

function updateJobTags(jobDiv) {
    const jobId = jobDiv.dataset.jobId;
    const tagsContainer = jobDiv.querySelector('.job-tags');
    const job = state.currentResume.jobs[jobId];

    tagsContainer.innerHTML = '';
    job.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagSpan.onclick = () => removeJobTag(jobId, tag);
        tagsContainer.appendChild(tagSpan);
    });

    // Add tag button
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'add-tag';
    addTagBtn.textContent = '+';
    addTagBtn.onclick = () => addJobTag(jobId);
    tagsContainer.appendChild(addTagBtn);
}

function updateBulletTags(bulletDiv) {
    const bulletId = bulletDiv.dataset.bulletId;
    const tagsContainer = bulletDiv.querySelector('.bullet-tags');
    const bullet = state.currentResume.bulletPoints[bulletId];

    tagsContainer.innerHTML = '';
    bullet.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagSpan.onclick = () => removeBulletTag(bulletId, tag);
        tagsContainer.appendChild(tagSpan);
    });

    // Add tag button
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'add-tag';
    addTagBtn.textContent = '+';
    addTagBtn.onclick = () => addBulletTag(bulletId);
    tagsContainer.appendChild(addTagBtn);
}

function addJobTag(jobId) {
    const tag = prompt('Enter tag (e.g., "Frontend", "Management"):');
    if (!tag) return;

    if (!state.tags.includes(tag)) {
        state.tags.push(tag);
    }

    const job = state.currentResume.jobs[jobId];
    if (!job.tags.includes(tag)) {
        job.tags.push(tag);
        const jobDiv = document.querySelector(`.job[data-job-id="${jobId}"]`);
        updateJobTags(jobDiv);
        updateResume();
    }
}

function addBulletTag(bulletId) {
    const tag = prompt('Enter tag (e.g., "Technical", "Leadership"):');
    if (!tag) return;

    if (!state.tags.includes(tag)) {
        state.tags.push(tag);
    }

    const bullet = state.currentResume.bulletPoints[bulletId];
    if (!bullet.tags.includes(tag)) {
        bullet.tags.push(tag);
        const bulletDiv = document.querySelector(`.bullet-point[data-bullet-id="${bulletId}"]`);
        updateBulletTags(bulletDiv);
        updateResume();
    }
}

function moveJob(button, direction) {
    const jobDiv = button.closest('.job');
    const jobId = jobDiv.dataset.jobId;
    const currentSection = jobDiv.closest('.section');
    const currentSectionId = currentSection.dataset.sectionId;

    // Find job and relevant sections in state
    const job = state.currentResume.jobs.find(j => j.id === jobId);
    const sections = state.currentResume.sections;
    const currentSectionIndex = sections.findIndex(s => s.id === currentSectionId);

    // Get jobs in current section
    const sectionJobs = state.currentResume.jobs
        .filter(j => j.section_id === currentSectionId)
        .sort((a, b) => a.order_index - b.order_index);

    const currentJobIndex = sectionJobs.findIndex(j => j.id === jobId);

    if (direction === 'up') {
        if (currentJobIndex > 0) {
            // Swap order_index with previous job in same section
            const temp = job.order_index;
            job.order_index = sectionJobs[currentJobIndex - 1].order_index;
            sectionJobs[currentJobIndex - 1].order_index = temp;
        } else if (currentSectionIndex > 0) {
            // Move to end of previous section
            const prevSectionId = sections[currentSectionIndex - 1].id;
            const prevSectionJobs = state.currentResume.jobs
                .filter(j => j.section_id === prevSectionId);

            job.section_id = prevSectionId;
            job.order_index = prevSectionJobs.length > 0
                ? Math.max(...prevSectionJobs.map(j => j.order_index)) + 1
                : 0;
        }
    } else if (direction === 'down') {
        if (currentJobIndex < sectionJobs.length - 1) {
            // Swap order_index with next job in same section
            const temp = job.order_index;
            job.order_index = sectionJobs[currentJobIndex + 1].order_index;
            sectionJobs[currentJobIndex + 1].order_index = temp;
        } else if (currentSectionIndex < sections.length - 1) {
            // Move to beginning of next section
            const nextSectionId = sections[currentSectionIndex + 1].id;
            const nextSectionJobs = state.currentResume.jobs
                .filter(j => j.section_id === nextSectionId);

            job.section_id = nextSectionId;
            job.order_index = nextSectionJobs.length > 0
                ? Math.min(...nextSectionJobs.map(j => j.order_index)) - 1
                : 0;
        }
    }

    // Normalize indices for all affected sections
    sections.forEach(section => {
        const sectionJobs = state.currentResume.jobs.filter(j => j.section_id === section.id);
        normalizeOrderIndices(sectionJobs);
    });

    // Update UI to reflect state changes
    updateUI();
}

function moveBullet(button, direction) {
    const bulletDiv = button.closest('.bullet-point');
    const bulletId = bulletDiv.dataset.bulletId;
    const jobDiv = bulletDiv.closest('.job');
    const jobId = jobDiv.dataset.jobId;

    // Find bullet points for this job
    const jobBullets = state.currentResume.bulletPoints
        .filter(b => b.job_id === jobId)
        .sort((a, b) => a.order_index - b.order_index);

    const currentBulletIndex = jobBullets.findIndex(b => b.id === bulletId);
    const bullet = jobBullets[currentBulletIndex];

    // Swap with previous/next bullet based on direction
    if (direction === 'up' && currentBulletIndex > 0) {
        // Move up means decreasing order_index
        const temp = bullet.order_index;
        bullet.order_index = jobBullets[currentBulletIndex - 1].order_index;
        jobBullets[currentBulletIndex - 1].order_index = temp;
    } else if (direction === 'down' && currentBulletIndex < jobBullets.length - 1) {
        // Move down means increasing order_index
        const temp = bullet.order_index;
        bullet.order_index = jobBullets[currentBulletIndex + 1].order_index;
        jobBullets[currentBulletIndex + 1].order_index = temp;
    }

    // Normalize indices for all bullets in this job
    const allJobBullets = state.currentResume.bulletPoints.filter(b => b.job_id === jobId);
    normalizeOrderIndices(allJobBullets);

    // Update UI to reflect state changes
    updateUI();
}

function duplicateBullet(button) {
    const bulletDiv = button.closest('.bullet-point');
    const jobDiv = bulletDiv.closest('.job');
    const jobId = jobDiv.dataset.jobId;
    const originalBulletId = bulletDiv.dataset.bulletId;

    // Create new bullet point data
    const newBulletId = generateId();
    const originalBullet = state.currentResume.bulletPoints[originalBulletId];

    // Copy the original bullet's text
    state.currentResume.bulletPoints[newBulletId] = {
        id: newBulletId,
        text: originalBullet.text
    };

    // Insert the new bullet ID after the original one in the job's bulletPoints array
    const job = state.currentResume.jobs[jobId];
    const originalIndex = job.bulletPoints.indexOf(originalBulletId);
    job.bulletPoints.splice(originalIndex + 1, 0, newBulletId);

    // Copy the visibility state from the original bullet
    state.variations[state.currentVariation].selectedBullets[newBulletId] =
        state.variations[state.currentVariation].selectedBullets[originalBulletId] || false;

    // Create and insert the new bullet point UI element
    const template = document.getElementById('bullet-template');
    const newBulletDiv = template.content.cloneNode(true).firstElementChild;
    newBulletDiv.dataset.bulletId = newBulletId;

    // Set up the new bullet point
    const textArea = newBulletDiv.querySelector('textarea');
    const checkbox = newBulletDiv.querySelector('input[type="checkbox"]');

    textArea.value = originalBullet.text;
    checkbox.checked = state.variations[state.currentVariation].selectedBullets[newBulletId];

    // Add event listeners
    textArea.addEventListener('input', () => {
        state.currentResume.bulletPoints[newBulletId].text = textArea.value;
        autoResizeTextarea(textArea);
        updateResume();
    });

    checkbox.addEventListener('change', () => {
        state.variations[state.currentVariation].selectedBullets[newBulletId] = checkbox.checked;
        updateResume();
    });

    // Insert the new bullet point right after the original one
    bulletDiv.insertAdjacentElement('afterend', newBulletDiv);

    // Initial resize for the textarea
    autoResizeTextarea(textArea);
    updateResume();
}

function deleteBullet(button) {
    const bulletDiv = button.closest('.bullet-point');
    const bulletId = bulletDiv.dataset.bulletId;
    const jobDiv = bulletDiv.closest('.job');
    const jobId = jobDiv.dataset.jobId;

    if (!confirm("WARNING: This will delete the bullet point for all resume variations permanently. Only delete bullet point if you will never need it again. If you want to hide this bullet point from a resume, uncheck it instead.")) {
        return;
    }

    // Remove bullet from state
    const bulletIndex = state.currentResume.bulletPoints.findIndex(b => b.id === bulletId);
    if (bulletIndex > -1) {
        state.currentResume.bulletPoints.splice(bulletIndex, 1);
    }

    // Remove bullet from all variations
    Object.values(state.variations).forEach(variation => {
        if (variation.bulletPoints) {
            variation.bulletPoints = variation.bulletPoints.filter(bp => bp.bullet_point_id !== bulletId);
        }
    });

    // Remove from UI
    bulletDiv.remove();
    updateResume();
}

function loadVariation(variationId) {
    console.log('loadVariation', variationId);
    if (!variationId || !state.variations[variationId]) {
        console.error('Invalid variation ID:', variationId);
        return;
    }

    state.currentVariation = variationId;
    const variation = state.variations[variationId];

    // Update variant name in toolbar
    document.querySelector('.variant-name').textContent = variation.name;

    // Update theme and spacing
    const themeSelect = document.getElementById('themeSelect');
    const spacingSelect = document.getElementById('spacingSelect');

    themeSelect.value = variation.theme || 'default';
    spacingSelect.value = variation.spacing || 'normal';

    document.documentElement.setAttribute('data-theme', variation.theme || 'default');
    document.documentElement.setAttribute('data-spacing', variation.spacing || 'normal');
    currentSpacing = variation.spacing || 'normal';

    // Update bio for this variation
    const bioTextarea = document.getElementById('bio');
    bioTextarea.value = variation.bio || '';
    autoResizeTextarea(bioTextarea);

    // Update checkbox states based on visibility
    document.querySelectorAll('.bullet-point').forEach(bulletDiv => {
        const bulletId = bulletDiv.dataset.bulletId;
        const checkbox = bulletDiv.querySelector('input[type="checkbox"]');
        const bulletPoint = variation.bulletPoints.find(bp => bp.bullet_point_id === bulletId);
        checkbox.checked = bulletPoint ? bulletPoint.is_visible : true;
    });

    updateResume();
}

function updateResume() {
    markUnsavedChanges();
    const resumeContent = document.getElementById('resumeContent');
    resumeContent.innerHTML = '';

    // Update personal info in state
    state.currentResume.full_name = document.getElementById('name').value.trim();
    state.currentResume.contact_info = document.getElementById('contact').value.trim();

    if (!state.currentVariation || !state.variations[state.currentVariation]) {
        return;
    }

    const variation = state.variations[state.currentVariation];
    variation.bio = document.getElementById('bio').value.trim();

    // Function to convert URLs to clickable links
    function linkifyText(text) {
        // Common false positives to exclude (case-insensitive)
        const exclusions = /\b(B\.S\.|M\.S\.|Ph\.D\.|Dr\.|Mr\.|Mrs\.|Ms\.|Sr\.|Jr\.|vs\.)\b/i;

        // Get stored false positives from localStorage
        const falsePositives = JSON.parse(localStorage.getItem('falsePositiveUrls') || '[]');
        const falsePositivePattern = falsePositives.length > 0 ?
            new RegExp(`\\b(${falsePositives.map(fp => fp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi') :
            null;

        // More precise URL pattern
        const urlPattern = /\b(?:https?:\/\/)?(?:www\.)?(?![-.])([-\w.]+\.(?:com|net|org|edu|gov|mil|biz|info|io|co|ai|app|dev|cafe|tech|xyz|me|site|web|cloud|store|shop|online|blog|team|docs|pages|news|guide|space|world|life|live|media|games|studio|design|link|click|email|mail|app|apple|google|microsoft|amazon|meta|linkedin|github|gitlab|bitbucket|stackoverflow|medium|dev\.to))\b(?:[-\w\/#@%+=~|]*)(?!\.)\b/gi;

        // Function to safely encode text to base64
        const safeEncode = (str) => {
            try {
                return btoa(encodeURIComponent(str));
            } catch (e) {
                console.error('Encoding error:', e);
                return str;
            }
        };

        // Function to safely decode base64 text
        const safeDecode = (str) => {
            try {
                return decodeURIComponent(atob(str));
            } catch (e) {
                console.error('Decoding error:', e);
                return str;
            }
        };

        // First, temporarily encode excluded patterns and false positives
        let processedText = text.replace(exclusions, match => `__${safeEncode(match)}__`);
        if (falsePositivePattern) {
            processedText = processedText.replace(falsePositivePattern, match => `__${safeEncode(match)}__`);
        }

        // Then process URLs
        processedText = processedText.replace(urlPattern, (url) => {
            const fullUrl = url.startsWith('http') ? url : `https://${url}`;
            // Add data attributes for the confirmation popup
            return `<a href="#" data-url="${fullUrl}" data-original-text="${url}" class="pending-link">${url}</a>`;
        });

        // Finally, decode the excluded patterns
        return processedText.replace(/__([A-Za-z0-9+/=]+)__/g, (_, encoded) => safeDecode(encoded));
    }

    // Create popup styles if they don't exist
    if (!document.getElementById('link-popup-styles')) {
        const styles = document.createElement('style');
        styles.id = 'link-popup-styles';
        styles.textContent = `
            .link-popup {
                position: fixed;
                background: white;
                border: 1px solid var(--theme-primary);
                border-radius: 8px;
                padding: 12px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 1000;
                display: none;
                font-size: 14px;
                max-width: 300px;
                opacity: 0;
                transform: scale(0.95);
                transition: opacity 0.15s ease, transform 0.15s ease;
            }
            .link-popup.visible {
                opacity: 1;
                transform: scale(1);
            }
            .link-popup p {
                margin: 0 0 10px 0;
                color: var(--theme-text);
            }
            .link-popup .buttons {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            .link-popup button {
                padding: 4px 8px;
                border: 1px solid var(--theme-primary);
                border-radius: 4px;
                background: white;
                color: var(--theme-primary);
                cursor: pointer;
                font-size: 12px;
            }
            .link-popup button.open-link {
                background: var(--theme-primary);
                color: white;
            }
            .link-popup button:hover {
                opacity: 0.9;
            }
            .pending-link {
                border-bottom: 1px dashed var(--theme-link);
            }
        `;
        document.head.appendChild(styles);
    }

    // Create popup element if it doesn't exist
    let popup = document.getElementById('link-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'link-popup';
        popup.className = 'link-popup';
        popup.innerHTML = `
            <p>Open this link?</p>
            <p class="link-url" style="color: var(--theme-primary); font-size: 12px;"></p>
            <div class="buttons">
                <button class="not-link">Not a Link</button>
                <button class="open-link">Open Link</button>
            </div>
        `;
        document.body.appendChild(popup);
    }

    // Function to handle link clicks
    function handleLinkClick(e) {
        if (!e.target.matches('.pending-link')) return;
        e.preventDefault();

        const url = e.target.dataset.url;
        const originalText = e.target.dataset.originalText;
        const rect = e.target.getBoundingClientRect();

        // Update popup content
        popup.querySelector('.link-url').textContent = url;

        // Make popup visible but not positioned yet (to get its dimensions)
        popup.style.display = 'block';
        const popupRect = popup.getBoundingClientRect();

        // Calculate available space
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Position horizontally
        let left = rect.left;
        if (left + popupRect.width > window.innerWidth) {
            left = window.innerWidth - popupRect.width - 10; // 10px padding from window edge
        }
        left = Math.max(10, left); // Ensure at least 10px from left edge

        // Position vertically - if not enough space below, show above
        let top;
        if (spaceBelow >= popupRect.height + 5) {
            // Show below
            top = rect.bottom + 5;
            popup.style.transformOrigin = 'top left';
        } else if (spaceAbove >= popupRect.height + 5) {
            // Show above
            top = rect.top - popupRect.height - 5;
            popup.style.transformOrigin = 'bottom left';
        } else {
            // Not enough space above or below, show in middle of screen
            top = (viewportHeight - popupRect.height) / 2;
            popup.style.transformOrigin = 'center left';
        }

        // Apply the calculated position
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;

        // Show popup with animation
        requestAnimationFrame(() => {
            popup.classList.add('visible');
        });

        // Update click handlers with the current url and originalText
        popup.querySelector('.open-link').onclick = () => {
            window.open(url, '_blank', 'noopener,noreferrer');
            hidePopup();
        };

        popup.querySelector('.not-link').onclick = () => {
            // Add to false positives
            const falsePositives = JSON.parse(localStorage.getItem('falsePositiveUrls') || '[]');
            if (!falsePositives.includes(originalText)) {
                falsePositives.push(originalText);
                localStorage.setItem('falsePositiveUrls', JSON.stringify(falsePositives));
            }

            // Replace link with plain text
            const span = document.createElement('span');
            span.textContent = originalText;
            e.target.parentNode.replaceChild(span, e.target);
            hidePopup();

            // Update resume to reflect changes
            updateResume();
        };
    }

    // Update show/hide logic for popup
    function showPopup() {
        popup.classList.add('visible');
    }

    function hidePopup() {
        popup.classList.remove('visible');
        setTimeout(() => {
            if (!popup.classList.contains('visible')) {
                popup.style.display = 'none';
            }
        }, 150);
    }

    // Update outside click handler
    document.addEventListener('click', (e) => {
        if (!e.target.matches('.pending-link') && !e.target.closest('.link-popup')) {
            hidePopup();
        }
    });

    // Generate resume content
    let contentHTML = '';

    // Add personal info header
    if (state.currentResume.full_name || state.currentResume.contact_info || variation.bio) {
        contentHTML += `<div class='resume-header'>`;
        if (state.currentResume.full_name) contentHTML += `<h1>${state.currentResume.full_name}</h1>`;
        if (state.currentResume.contact_info) contentHTML += `<p>${linkifyText(state.currentResume.contact_info)}</p>`;
        if (variation.bio) contentHTML += `<p>${linkifyText(variation.bio)}</p>`;
        contentHTML += `</div>`;
    }

    // Sort sections by order_index
    const sortedSections = [...state.currentResume.sections].sort((a, b) => a.order_index - b.order_index);

    // Process sections in order
    sortedSections.forEach(section => {
        let sectionHasVisibleContent = false;
        let sectionHTML = `<div class='resume-section' id="preview-section-${section.id}">
                          <h2>${section.name}</h2><div class="section-content">`;

        // Get and sort jobs for this section
        const sectionJobs = state.currentResume.jobs
            .filter(job => job.section_id === section.id)
            .sort((a, b) => a.order_index - b.order_index);

        sectionJobs.forEach(job => {
            // Get and sort visible bullet points for this job
            const visibleBullets = state.currentResume.bulletPoints
                .filter(bullet => bullet.job_id === job.id)
                .filter(bullet => {
                    const bulletVisibility = variation.bulletPoints
                        .find(bp => bp.bullet_point_id === bullet.id);
                    return bulletVisibility?.is_visible;
                })
                .sort((a, b) => a.order_index - b.order_index);

            if (visibleBullets.length > 0) {
                sectionHasVisibleContent = true;
                sectionHTML += `<div class='resume-job' id="preview-job-${job.id}">`;
                sectionHTML += `<h3 style="cursor: pointer">${linkifyText(job.title)}</h3>`;
                if (job.company) {
                    sectionHTML += `<h4>${linkifyText(job.company)}</h4>`;
                }
                if (job.start_date || job.end_date) {
                    sectionHTML += `<p class="job-dates">`;
                    if (job.start_date) sectionHTML += job.start_date;
                    if (job.start_date && job.end_date) sectionHTML += ' - ';
                    if (job.end_date) sectionHTML += job.end_date;
                    sectionHTML += `</p>`;
                }
                sectionHTML += `<ul class="resume-bullet-points">`;
                visibleBullets.forEach(bullet => {
                    sectionHTML += `<li id="preview-bullet-${bullet.id}" style="cursor: pointer">${linkifyText(bullet.content)}</li>`;
                });
                sectionHTML += `</ul></div>`;
            }
        });

        sectionHTML += `</div></div>`;

        if (sectionHasVisibleContent) {
            contentHTML += sectionHTML;
        }
    });

    resumeContent.innerHTML = contentHTML;

    // Add click handlers to jobs and bullet points in the preview
    document.querySelectorAll('.resume-job h3').forEach(jobHeader => {
        const jobId = jobHeader.closest('.resume-job').id.replace('preview-job-', '');
        jobHeader.addEventListener('click', () => {
            const sidebarElement = document.querySelector(`.job[data-job-id="${jobId}"]`);
            if (sidebarElement) {
                const headerHeight = document.querySelector('#sidebar h2').offsetHeight;
                const sidebar = document.querySelector('#sidebar');
                sidebar.scrollTop = sidebarElement.offsetTop - headerHeight - 10;
                setTimeout(() => {
                    const titleInput = sidebarElement.querySelector('.job-title');
                    if (titleInput) {
                        titleInput.focus();
                        titleInput.setSelectionRange(0, 0);
                    }
                }, 100);
            }
        });
    });

    document.querySelectorAll('.resume-bullet-points li').forEach(bullet => {
        const bulletId = bullet.id.replace('preview-bullet-', '');
        bullet.addEventListener('click', () => {
            const sidebarElement = document.querySelector(`.bullet-point[data-bullet-id="${bulletId}"]`);
            if (sidebarElement) {
                const headerHeight = document.querySelector('#sidebar h2').offsetHeight;
                const sidebar = document.querySelector('#sidebar');
                sidebar.scrollTop = sidebarElement.offsetTop - headerHeight;
                const textarea = sidebarElement.querySelector('textarea');
                if (textarea) {
                    textarea.focus();
                }
            }
        });
    });

    // Add event listener for link clicks
    resumeContent.addEventListener('click', handleLinkClick);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const resizeHandle = document.querySelector('.sidebar-resize-wrapper');
    let isResizing = false;
    let startX;
    let startWidth;

    // Add debounce function for performance
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Debounced version of autoResizeAllTextareas
    const debouncedResize = debounce(() => {
        autoResizeAllTextareas(sidebar);
    }, 16); // ~60fps

    resizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.pageX;
        startWidth = sidebar.offsetWidth;
        e.preventDefault(); // Prevent text selection

        // Add resize class to improve performance during resize
        sidebar.classList.add('resizing');
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;

        const width = startWidth + (e.pageX - startX);
        if (width >= 360) { // Respect min-width
            sidebar.style.width = width + 'px';
            // Resize textareas while dragging
            debouncedResize();
        }

        // Prevent text selection while resizing
        e.preventDefault();
    });

    document.addEventListener('mouseup', function () {
        if (isResizing) {
            isResizing = false;
            // Remove resize class
            sidebar.classList.remove('resizing');
            // Final resize of textareas
            autoResizeAllTextareas(sidebar);
        }
    });

    // Also handle window resize events
    window.addEventListener('resize', debouncedResize);
}

// Show/hide modal
function showAuthModal() {
    authModal.style.display = 'block';
}

function hideAuthModal() {
    authModal.style.display = 'none';
    document.getElementById('loginError').textContent = '';
    document.getElementById('signupError').textContent = '';
}

// Close modal when clicking outside
window.onclick = function (event) {
    if (event.target === authModal) {
        hideAuthModal();
    }
};

closeBtn.onclick = hideAuthModal;

// Tab switching
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Update active tab
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show corresponding form
        const formId = tab.dataset.tab + 'Form';
        authForms.forEach(form => {
            form.classList.toggle('active', form.id === formId);
        });
    });
});

// Auth functions
async function signup() {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const errorElement = document.getElementById('signupError');

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to sign up');
        }

        state.userId = data.userId;
        state.isAuthenticated = true;
        localStorage.setItem('userId', data.userId);  // Save to localStorage
        hideAuthModal();
        updateAuthUI();
        loadResume(); // Load the default resume
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to log in');
        }

        state.userId = data.userId;
        state.isAuthenticated = true;
        localStorage.setItem('userId', data.userId);  // Save to localStorage
        hideAuthModal();
        updateAuthUI();
        loadResume(); // Load the user's resume
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

// Initialize default empty state
function createDefaultState() {
    const defaultVariationId = generateId();
    return {
        currentResume: {
            id: generateId(),
            title: 'My Resume',
            full_name: '',
            contact_info: '',
            sections: [],
            jobs: [],
            bulletPoints: []
        },
        variations: {
            [defaultVariationId]: {
                id: defaultVariationId,
                name: 'Default',
                bio: '',
                theme: 'default',
                spacing: 'normal',
                bulletPoints: []
            }
        },
        currentVariation: defaultVariationId,
        isDirty: false
    };
}

// Update loadResume function to work with authentication
async function loadResume() {
    if (!state.isAuthenticated) {
        showAuthModal();
        return;
    }

    // Initialize sidebar resize functionality
    initSidebarResize();

    // Check if required elements exist before proceeding
    const variationSelect = document.getElementById('variationSelect');
    const nameInput = document.getElementById('name');
    const contactInput = document.getElementById('contact');
    const bioTextarea = document.getElementById('bio');

    if (!variationSelect || !nameInput || !contactInput || !bioTextarea) {
        console.error('Required DOM elements not found. Retrying in 100ms...');
        setTimeout(loadResume, 100);
        return;
    }

    try {
        const response = await fetch(`/api/resume/${state.userId}`);
        if (!response.ok) {
            throw new Error('Failed to load resume');
        }

        const data = await response.json();
        console.log('Loaded data:', data);

        // Ensure arrays are unique by ID
        if (data.sections) {
            data.sections = Array.from(new Map(data.sections.map(s => [s.id, s])).values());
        }
        if (data.jobs) {
            data.jobs = Array.from(new Map(data.jobs.map(j => [j.id, j])).values());
        }
        if (data.bulletPoints) {
            data.bulletPoints = Array.from(new Map(data.bulletPoints.map(b => [b.id, b])).values());
        }

        state.currentResume = data;
        state.variations = data.variations;

        // Set current variation to first one if not set
        if (!state.currentVariation && Object.keys(data.variations).length > 0) {
            state.currentVariation = Object.keys(data.variations)[0];
        }

        updateUI();
        state.isDirty = false;
    } catch (error) {
        console.error('Error loading resume:', error);
        // Initialize with default state if load fails
        Object.assign(state, createDefaultState());
        updateUI();
    }
}

// Update updateUI to resize all textareas after loading content
function updateUI() {
    // Set personal info
    document.getElementById('name').value = state.currentResume.full_name || '';
    document.getElementById('contact').value = state.currentResume.contact_info || '';

    // Setup variations dropdown
    const variationSelect = document.getElementById('variationSelect');
    variationSelect.innerHTML = ''; // Clear existing options

    Object.entries(state.variations).forEach(([uuid, variation]) => {
        const option = document.createElement('option');
        option.value = uuid;
        option.textContent = variation.name;
        variationSelect.appendChild(option);
    });

    // Clear sections container
    document.getElementById('sectionsContainer').innerHTML = '';

    // Load sections
    state.currentResume.sections
        .sort((a, b) => a.order_index - b.order_index)
        .forEach(section => {
            // Create section UI
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'section';
            sectionDiv.dataset.sectionId = section.id;

            sectionDiv.innerHTML = `
                <div class="section-header">
                    <input type="text" class="section-name" value="${section.name}" placeholder="Section Name">
                </div>
                <div class="section-controls">
                    <button onclick="addJob(null, false, '${section.id}')" class="add-job-btn" title="Add Job">Add Job</button>
                    <div class="move-buttons">
                        <button onclick="moveSection(this, 'up')" title="Move Up">↑</button>
                        <button onclick="moveSection(this, 'down')" title="Move Down">↓</button>
                    </div>
                    <button onclick="deleteSection(this)" class="delete-section" title="Delete Section">×</button>
                </div>
                <div class="section-jobs"></div>
            `;

            // Add event listeners
            const nameInput = sectionDiv.querySelector('.section-name');
            nameInput.addEventListener('input', () => {
                section.name = nameInput.value;
                updateResume();
            });

            // Add to container
            document.getElementById('sectionsContainer').appendChild(sectionDiv);

            // Load jobs for this section
            const sectionJobs = state.currentResume.jobs
                .filter(job => job.section_id === section.id)
                .sort((a, b) => a.order_index - b.order_index);

            const jobsContainer = sectionDiv.querySelector('.section-jobs');
            sectionJobs.forEach(job => {
                const jobDiv = addJob(job, true); // Skip state update since job is already in state
                jobsContainer.appendChild(jobDiv);

                // Add bullet points for this job
                const bulletContainer = jobDiv.querySelector('.bulletPointsContainer');
                const jobBullets = state.currentResume.bulletPoints
                    .filter(bp => bp.job_id === job.id)
                    .sort((a, b) => a.order_index - b.order_index);

                jobBullets.forEach(bullet => {
                    addBulletPoint(bulletContainer, bullet, true); // Skip state update since bullet is already in state
                });
            });
        });

    // Show/hide Add Job button based on sections existence
    // const addJobBtn = document.getElementById('addJobBtn');
    // addJobBtn.classList.toggle('visible', state.currentResume.sections.length > 0);

    // Load current variation
    if (state.currentVariation) {
        loadVariation(state.currentVariation);
    }

    // Ensure all textareas are properly sized
    autoResizeAllTextareas();

    updateResume();
    clearUnsavedChanges();
}

function deleteJob(buttonOrEvent) {
    const jobDiv = buttonOrEvent.target ?
        buttonOrEvent.target.closest('.job') :
        buttonOrEvent.closest('.job');

    if (jobDiv) {
        if (!confirm("WARNING: This will delete the job for all resume variations permanently. Only delete job if you will never need it again. If you want to hide this job from a resume, uncheck all bullet points instead.")) {
            return;
        }

        const jobId = jobDiv.dataset.jobId;

        // Find and remove all bullet points associated with this job
        const jobBullets = state.currentResume.bulletPoints.filter(bp => bp.job_id === jobId);
        jobBullets.forEach(bullet => {
            // Remove bullet from all variations
            Object.values(state.variations).forEach(variation => {
                if (variation.bulletPoints) {
                    variation.bulletPoints = variation.bulletPoints.filter(bp => bp.bullet_point_id !== bullet.id);
                }
            });
        });

        // Remove all bullet points for this job from state
        state.currentResume.bulletPoints = state.currentResume.bulletPoints.filter(bp => bp.job_id !== jobId);

        // Remove job from state
        const jobIndex = state.currentResume.jobs.findIndex(j => j.id === jobId);
        if (jobIndex > -1) {
            state.currentResume.jobs.splice(jobIndex, 1);
        }

        // Remove from UI
        jobDiv.remove();
        updateResume();
    }
}

function setupJobEventListeners(jobDiv) {
    const deleteButton = jobDiv.querySelector('.delete-job');
    if (deleteButton) {
        deleteButton.addEventListener('click', deleteJob);
    }
}

function markUnsavedChanges() {
    if (!hasUnsavedChanges) {
        hasUnsavedChanges = true;
        updateUnsavedIndicator();
    }
}

function clearUnsavedChanges() {
    hasUnsavedChanges = false;
    updateUnsavedIndicator();
}

function updateUnsavedIndicator() {
    let indicator = document.querySelector('.unsaved-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'unsaved-indicator';
        document.querySelector('.resume-container').appendChild(indicator);
    }

    if (hasUnsavedChanges) {
        indicator.textContent = 'UNSAVED CHANGES';
        indicator.style.display = 'block';
    } else {
        indicator.style.display = 'none';
    }
}

// Add window beforeunload warning
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Ensure DOM is loaded before initializing
document.addEventListener('DOMContentLoaded', function () {
    // Check for stored auth state
    if (state.isAuthenticated && state.userId) {
        loadResume();
    } else {
        showAuthModal();
    }
});

async function exportToPDF() {
    const element = document.getElementById('resumeContent');
    const currentTheme = document.getElementById('themeSelect').value;

    try {
        // Add PDF-specific class
        element.classList.add('generating-pdf');

        // Debug: Check if we have the resume content
        console.log('Resume content found:', !!element);
        console.log('Resume content HTML:', element?.outerHTML);

        // Function to get styles from a stylesheet
        const getStylesFromSheet = (sheet) => {
            try {
                if (sheet.cssRules) {
                    return Array.from(sheet.cssRules)
                        .map(rule => rule.cssText)
                        .join('\n');
                }
            } catch (e) {
                console.warn('Could not access cssRules for sheet', e);
            }
            return '';
        };

        // Get all styles from document
        const styles = Array.from(document.styleSheets)
            .map(sheet => getStylesFromSheet(sheet))
            .filter(Boolean)
            .join('\n');

        // Debug: Log collected styles
        console.log('Collected styles length:', styles.length);

        // Get computed theme variables
        const themeVars = {};
        const computedStyle = getComputedStyle(document.documentElement);
        for (const prop of computedStyle) {
            if (prop.startsWith('--theme-') || prop.startsWith('--resume-')) {
                themeVars[prop] = computedStyle.getPropertyValue(prop);
            }
        }

        // Debug: Log theme variables
        console.log('Theme variables:', themeVars);

        // Get the HTML content
        const html = `
            <!DOCTYPE html>
            <html lang="en" data-theme="${currentTheme}" data-spacing="${currentSpacing}">
            <head>
                <meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    ${styles}
                    
                    /* Additional PDF-specific styles */
                    body {
                        margin: 0;
                        padding: 0;
                        background: white;
                    }
                    
                    #resumeContent {
                        background: white !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        width: 100% !important;
                        padding: 0 !important;
                        min-height: 0 !important;
                    }

                    /* Ensure theme and spacing variables are preserved */
                    :root[data-theme="${currentTheme}"][data-spacing="${currentSpacing}"] {
                        ${Object.entries(themeVars)
                .map(([prop, value]) => `${prop}: ${value};`)
                .join('\n')}
                    }

                    /* PDF-specific color adjustments */
                    .resume-header {
                        border-bottom: 2px solid var(--theme-underline) !important;
                        padding-bottom: var(--resume-header-padding) !important;
                        margin-bottom: var(--resume-header-margin) !important;
                    }

                    .resume-section {
                        margin-bottom: var(--resume-section-margin) !important;
                    }

                    .resume-bullet-points li {
                        margin-bottom: var(--resume-bullet-margin) !important;
                    }

                    .resume-header h1 {
                        color: var(--theme-heading) !important;
                    }

                    .resume-header p {
                        color: var(--theme-text) !important;
                    }

                    .resume-section h3 {
                        color: var(--theme-primary) !important;
                    }

                    .resume-bullet-points li {
                        color: var(--theme-text) !important;
                    }

                    /* Ensure good contrast for printing */
                    @media print {
                        .resume-header h1 {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        
                        .resume-section h3 {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .resume-bullet-points li {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    }
                </style>
            </head>
            <body>
                <div id="resumeContent">
                    ${element.innerHTML}
                </div>
            </body>
            </html>
        `;

        // Debug: Log the final HTML
        console.log('Final HTML length:', html.length);

        // Make request to generate PDF
        console.log('Sending request to generate PDF...');
        const response = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                html,
                theme: currentTheme,
                spacing: currentSpacing
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to generate PDF: ${errorData.details || 'Unknown error'}`);
        }

        // Get the PDF data as an array buffer first
        const pdfBuffer = await response.arrayBuffer();
        console.log('Received PDF buffer size:', pdfBuffer.byteLength);

        // Create blob from array buffer
        const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

        // Verify the blob
        console.log('Created PDF blob:', {
            size: pdfBlob.size,
            type: pdfBlob.type
        });

        if (pdfBlob.size === 0) {
            throw new Error('Received empty PDF data');
        }

        // Create download link
        const downloadUrl = URL.createObjectURL(pdfBlob);

        // Get name, variation, and theme for filename
        const fullName = state.currentResume.name || 'Resume';
        const currentVariation = document.getElementById('variationSelect').value;
        const variationName = state.variations[currentVariation]?.name || 'Default';

        // Create filename: "Full Name - Variation - Theme.pdf"
        // Replace any invalid filename characters with dashes
        const filename = `${fullName} - ${variationName} - ${currentTheme}.pdf`
            .replace(/[/\\?%*:|"<>]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();

        // Create and click download link
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        // Force binary transfer mode
        a.setAttribute('download', '');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up
        setTimeout(() => {
            URL.revokeObjectURL(downloadUrl);
        }, 100);

    } catch (error) {
        console.error('PDF generation failed:', error);
        alert(`Failed to generate PDF: ${error.message}`);
    } finally {
        element.classList.remove('generating-pdf');
    }
}

// Theme handling
function changeTheme() {
    const themeSelect = document.getElementById('themeSelect');
    const selectedTheme = themeSelect.value;
    document.documentElement.setAttribute('data-theme', selectedTheme);

    // Save theme preference to current variation
    state.variations[state.currentVariation].theme = selectedTheme;
    markUnsavedChanges();
}

// Spacing handling
function changeSpacing() {
    const spacingSelect = document.getElementById('spacingSelect');
    const selectedSpacing = spacingSelect.value;
    document.documentElement.setAttribute('data-spacing', selectedSpacing);
    currentSpacing = selectedSpacing;

    // Save spacing preference to current variation
    state.variations[state.currentVariation].spacing = selectedSpacing;
    markUnsavedChanges();
}

// Remove the old theme/spacing loading functions since we now load per variation
const originalLoadResume = window.loadResume;
window.loadResume = function () {
    if (typeof originalLoadResume === 'function') {
        originalLoadResume();
    }
};

// Add new section-related functions
function moveSection(button, direction) {
    const sectionDiv = button.closest('.section');
    const sectionId = sectionDiv.dataset.sectionId;

    // Find section in state
    const sections = state.currentResume.sections;
    const currentIndex = sections.findIndex(s => s.id === sectionId);

    if (direction === 'up' && currentIndex > 0) {
        // Swap order_index with previous section
        const temp = sections[currentIndex].order_index;
        sections[currentIndex].order_index = sections[currentIndex - 1].order_index;
        sections[currentIndex - 1].order_index = temp;
    } else if (direction === 'down' && currentIndex < sections.length - 1) {
        // Swap order_index with next section
        const temp = sections[currentIndex].order_index;
        sections[currentIndex].order_index = sections[currentIndex + 1].order_index;
        sections[currentIndex + 1].order_index = temp;
    }

    // Normalize indices to ensure they're continuous
    normalizeOrderIndices(sections);

    // Update UI to reflect state changes
    updateUI();
}

function deleteSection(button) {
    const sectionDiv = button.closest('.section');
    const sectionId = sectionDiv.dataset.sectionId;

    if (!confirm("WARNING: This will delete the section and all its jobs permanently. Are you sure?")) {
        return;
    }

    // Remove all jobs in this section
    const jobsToRemove = state.currentResume.jobs.filter(job => job.section_id === sectionId);
    jobsToRemove.forEach(job => {
        // Remove all bullet points for this job
        const bulletPoints = state.currentResume.bulletPoints.filter(bp => bp.job_id === job.id);
        bulletPoints.forEach(bp => {
            const index = state.currentResume.bulletPoints.indexOf(bp);
            if (index > -1) {
                state.currentResume.bulletPoints.splice(index, 1);
            }
        });

        // Remove job
        const index = state.currentResume.jobs.indexOf(job);
        if (index > -1) {
            state.currentResume.jobs.splice(index, 1);
        }
    });

    // Remove section from state
    const sectionIndex = state.currentResume.sections.findIndex(s => s.id === sectionId);
    if (sectionIndex > -1) {
        state.currentResume.sections.splice(sectionIndex, 1);
    }

    // Remove from UI
    sectionDiv.remove();
    updateResume();
}

// Add section movement functions to window
window.moveSection = moveSection;
window.deleteSection = deleteSection;

async function renameVariation() {
    if (!state.currentVariation) return;

    const variation = state.variations[state.currentVariation];
    const newName = prompt('Enter new name for variation:', variation.name);
    if (!newName) return;

    try {
        const response = await fetch(`/api/resume/${state.userId}/variation/${state.currentVariation}/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: newName })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to rename variation');
        }

        // Update variation name in state
        variation.name = newName;

        // Update dropdown option
        const option = document.querySelector(`#variationSelect option[value="${state.currentVariation}"]`);
        if (option) {
            option.textContent = newName;
        }

        // Update toolbar display
        document.querySelector('.variant-name').textContent = newName;

        markUnsavedChanges();
    } catch (error) {
        console.error('Error renaming variation:', error);
        alert(error.message || 'Failed to rename variation');
    }
}

async function deleteVariation() {
    if (!state.currentVariation) return;

    // Don't allow deleting the last variation
    if (Object.keys(state.variations).length <= 1) {
        alert('Cannot delete the last variation. At least one variation must exist.');
        return;
    }

    if (!confirm('Are you sure you want to delete this variation? This cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/resume/${state.userId}/variation/${state.currentVariation}/`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete variation');
        }

        // Remove from state
        const deletedId = state.currentVariation;
        delete state.variations[deletedId];

        // Remove from dropdown
        const option = document.querySelector(`#variationSelect option[value="${deletedId}"]`);
        if (option) {
            option.remove();
        }

        // Switch to another variation
        const remainingVariationId = Object.keys(state.variations)[0];
        document.getElementById('variationSelect').value = remainingVariationId;
        loadVariation(remainingVariationId);

        markUnsavedChanges();
    } catch (error) {
        console.error('Error deleting variation:', error);
        alert(error.message);
    }
}

// Function to update UI based on auth state
function updateAuthUI() {
    const authButton = document.getElementById('authButton');
    const signOutButton = document.getElementById('signOutButton');
    const toolbarControls = document.querySelectorAll('.resume-toolbar-right > div:not(.auth-controls)');

    if (!authButton || !signOutButton) {
        console.log('Auth buttons not yet loaded');
        return;
    }

    if (state.isAuthenticated) {
        authButton.style.display = 'none';
        signOutButton.style.display = 'block';
        toolbarControls.forEach(control => control.style.display = 'block');
    } else {
        authButton.style.display = 'block';
        signOutButton.style.display = 'none';
        toolbarControls.forEach(control => control.style.display = 'none');
    }
}

// Function to handle sign out
function signOut() {
    state.userId = null;
    state.isAuthenticated = false;
    state.currentResume = null;
    state.currentVariation = null;
    state.variations = {};
    state.isDirty = false;
    localStorage.removeItem('userId');  // Remove from localStorage
    updateAuthUI();
    // Clear the resume content
    document.getElementById('resumeContent').innerHTML = '';
}
