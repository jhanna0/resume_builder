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
    full_name: '',
    contact_info: '',
    sections: [],
    jobs: [],
    bulletPoints: [],
    variations: {},
    currentVariation: null,
    isDirty: false,
    isAuthenticated: Boolean(localStorage.getItem('userId')),
    hasUnsavedChanges: false
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
    const maxOrderIndex = state.sections.length > 0
        ? Math.max(...state.sections.map(s => s.order_index))
        : -1;

    const section = {
        id: sectionId,
        name: name,
        order_index: sectionData?.order_index ?? (maxOrderIndex + 1)
    };

    // Add to state
    state.sections.push(section);

    // Normalize all section indices to ensure they're continuous
    state.sections = normalizeOrderIndices(state.sections);

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
            <button onclick="deleteSection(this)" class="delete-job" title="Delete Section">×</button>
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

        // Automatically add a job to the new section
        const jobDiv = addJob({
            section_id: sectionId,
            title: state.placeholders?.jobTips?.title || '',
            company: state.placeholders?.jobTips?.company || '',
            start_date: '',
            end_date: ''
        }, false); // Don't skip state update
    }

    // Ensure the resume preview is updated
    updateResume();

    return section;
}

// Helper function to check if a job is empty
function isJobEmpty(job) {
    // Check if job has no title and no bullet points
    const hasTitle = job.title && job.title.trim().length > 0;
    const hasBullets = state.bulletPoints.some(bp =>
        bp.job_id === job.id && bp.content && bp.content.trim().length > 0
    );
    return !hasTitle && !hasBullets;
}

// Update saveResume function to handle both authenticated and unauthenticated states
async function saveResume() {
    // Filter out empty jobs before saving
    const nonEmptyJobs = state.jobs.filter(job => !isJobEmpty(job));

    // If jobs were filtered out, update the state
    if (nonEmptyJobs.length !== state.jobs.length) {
        state.jobs = nonEmptyJobs;
        // Also remove bullet points for removed jobs
        state.bulletPoints = state.bulletPoints.filter(bp =>
            nonEmptyJobs.some(job => job.id === bp.job_id)
        );
        // Update UI to reflect removed jobs
        updateUI();
    }

    // If not authenticated, show auth modal and wait for authentication
    if (!state.isAuthenticated) {
        showAuthModal();
        return; // Don't proceed with save - the login process will handle merging the data
    }

    // If authenticated, proceed with normal save
    await saveResumeToServer({
        full_name: document.getElementById('name').value,
        contact_info: document.getElementById('contact').value,
        sections: state.sections,
        jobs: state.jobs,
        bulletPoints: state.bulletPoints,
        variations: state.variations
    });
}

// Helper function to save resume to server
async function saveResumeToServer(resumeData) {
    try {
        const response = await fetch(`/api/resume/${state.userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(resumeData)
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
    if (state.sections.length === 0) {
        addSection({ name: 'Experience', order_index: 0 });
    }

    // Use provided targetSectionId or get from jobData
    if (!targetSectionId) {
        targetSectionId = jobData?.section_id || state.sections[0].id;
    }

    // Check if there's already an empty job in this section
    if (!jobData) {
        const sectionJobs = state.jobs.filter(j => j.section_id === targetSectionId);
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
    const sectionJobs = state.jobs.filter(j => j.section_id === targetSectionId);
    const maxOrderIndex = sectionJobs.length > 0
        ? Math.max(...sectionJobs.map(j => j.order_index))
        : -1;

    const jobId = jobData?.id || generateId();

    // If this is a new job (no jobData) and we have placeholders, use them
    const defaultTitle = !jobData && state.placeholders?.jobTips?.title || '';
    const defaultCompany = !jobData && state.placeholders?.jobTips?.company || '';

    const job = {
        id: jobId,
        section_id: targetSectionId,
        title: jobData?.title || defaultTitle,
        company: jobData?.company || defaultCompany,
        start_date: jobData?.start_date || '',
        end_date: jobData?.end_date || '',
        order_index: jobData?.order_index ?? (maxOrderIndex + 1)
    };

    // Only update state if this is a new job and we're not skipping state update
    if (!skipStateUpdate && !state.jobs.find(j => j.id === jobId)) {
        state.jobs.push(job);
        // Normalize order indices for all jobs in this section
        const sectionJobs = state.jobs.filter(j => j.section_id === targetSectionId);
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
        const existingJob = state.jobs.find(j => j.id === jobId);
        if (existingJob) {
            existingJob.title = titleInput.value;
        }
        updateResume();
    });

    // Set company
    const companyInput = jobDiv.querySelector('.job-company');
    companyInput.value = job.company || '';
    companyInput.addEventListener('input', () => {
        const existingJob = state.jobs.find(j => j.id === jobId);
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
        const existingJob = state.jobs.find(j => j.id === jobId);
        if (existingJob) {
            existingJob.start_date = startDateInput.value;
        }
        updateResume();
    });

    endDateInput.addEventListener('input', () => {
        const existingJob = state.jobs.find(j => j.id === jobId);
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

    // Automatically add a bullet point if this is a new job
    if (!skipStateUpdate) {
        const bulletContainer = jobDiv.querySelector('.bulletPointsContainer');
        const randomTip = state.placeholders?.bulletTips?.[Math.floor(Math.random() * state.placeholders.bulletTips.length)] || '';
        const bulletData = {
            content: randomTip,
            job_id: jobId
        };
        const bulletDiv = addBulletPoint(bulletContainer, bulletData);

        // Ensure the bullet point is visible in the current variation
        if (state.currentVariation && state.variations[state.currentVariation]) {
            const variation = state.variations[state.currentVariation];
            const bulletId = bulletDiv.dataset.bulletId;
            if (!variation.bulletPoints) {
                variation.bulletPoints = [];
            }
            variation.bulletPoints.push({
                bullet_point_id: bulletId,
                is_visible: true
            });
        }

        // Update the resume preview
        updateResume();
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
    const jobBullets = state.bulletPoints.filter(b => b.job_id === jobId);
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
    if (!skipStateUpdate && !state.bulletPoints.find(b => b.id === bulletId)) {
        state.bulletPoints.push(bullet);
        // Normalize order indices for all bullets in this job
        const jobBullets = state.bulletPoints.filter(b => b.job_id === jobId);
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
        const existingBullet = state.bulletPoints.find(b => b.id === bulletId);
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
    const job = state.jobs[jobId];

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
    const bullet = state.bulletPoints[bulletId];

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

    const job = state.jobs[jobId];
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

    const bullet = state.bulletPoints[bulletId];
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
    const jobsContainer = currentSection.querySelector('.section-jobs');

    // Find job and relevant sections in state
    const job = state.jobs.find(j => j.id === jobId);
    const sections = state.sections;
    const currentSectionIndex = sections.findIndex(s => s.id === currentSectionId);

    // Get jobs in current section
    const sectionJobs = state.jobs
        .filter(j => j.section_id === currentSectionId)
        .sort((a, b) => a.order_index - b.order_index);

    const currentJobIndex = sectionJobs.findIndex(j => j.id === jobId);

    if (direction === 'up') {
        if (currentJobIndex > 0) {
            // Swap order_index with previous job in same section
            const temp = job.order_index;
            job.order_index = sectionJobs[currentJobIndex - 1].order_index;
            sectionJobs[currentJobIndex - 1].order_index = temp;

            // Move DOM element
            const prevJob = jobsContainer.querySelector(`[data-job-id="${sectionJobs[currentJobIndex - 1].id}"]`);
            if (prevJob) {
                jobsContainer.insertBefore(jobDiv, prevJob);
            }
        } else if (currentSectionIndex > 0) {
            // Move to end of previous section
            const prevSection = document.querySelector(`[data-section-id="${sections[currentSectionIndex - 1].id}"]`);
            const prevSectionJobs = prevSection.querySelector('.section-jobs');
            const prevSectionId = sections[currentSectionIndex - 1].id;
            const prevSectionJobsState = state.jobs.filter(j => j.section_id === prevSectionId);

            job.section_id = prevSectionId;
            job.order_index = prevSectionJobsState.length > 0
                ? Math.max(...prevSectionJobsState.map(j => j.order_index)) + 1
                : 0;

            // Move DOM element
            prevSectionJobs.appendChild(jobDiv);
        }
    } else if (direction === 'down') {
        if (currentJobIndex < sectionJobs.length - 1) {
            // Swap order_index with next job in same section
            const temp = job.order_index;
            job.order_index = sectionJobs[currentJobIndex + 1].order_index;
            sectionJobs[currentJobIndex + 1].order_index = temp;

            // Move DOM element
            const nextJob = jobsContainer.querySelector(`[data-job-id="${sectionJobs[currentJobIndex + 1].id}"]`);
            if (nextJob && nextJob.nextSibling) {
                jobsContainer.insertBefore(jobDiv, nextJob.nextSibling);
            } else if (nextJob) {
                jobsContainer.appendChild(jobDiv);
            }
        } else if (currentSectionIndex < sections.length - 1) {
            // Move to beginning of next section
            const nextSection = document.querySelector(`[data-section-id="${sections[currentSectionIndex + 1].id}"]`);
            const nextSectionJobs = nextSection.querySelector('.section-jobs');
            const nextSectionId = sections[currentSectionIndex + 1].id;
            const nextSectionJobsState = state.jobs.filter(j => j.section_id === nextSectionId);

            job.section_id = nextSectionId;
            job.order_index = nextSectionJobsState.length > 0
                ? Math.min(...nextSectionJobsState.map(j => j.order_index)) - 1
                : 0;

            // Move DOM element to beginning of next section's jobs
            const firstJob = nextSectionJobs.firstChild;
            if (firstJob) {
                nextSectionJobs.insertBefore(jobDiv, firstJob);
            } else {
                nextSectionJobs.appendChild(jobDiv);
            }
        }
    }

    // Normalize indices for affected sections
    [currentSectionId, sections[currentSectionIndex - 1]?.id, sections[currentSectionIndex + 1]?.id]
        .filter(Boolean)
        .forEach(sectionId => {
            const sectionJobs = state.jobs.filter(j => j.section_id === sectionId);
            normalizeOrderIndices(sectionJobs);
        });

    // Update resume preview only
    updateResume();
}

function moveBullet(button, direction) {
    const bulletDiv = button.closest('.bullet-point');
    const bulletId = bulletDiv.dataset.bulletId;
    const jobDiv = bulletDiv.closest('.job');
    const jobId = jobDiv.dataset.jobId;
    const bulletContainer = bulletDiv.closest('.bulletPointsContainer');

    // Find bullet points for this job
    const jobBullets = state.bulletPoints
        .filter(b => b.job_id === jobId)
        .sort((a, b) => a.order_index - b.order_index);

    const currentBulletIndex = jobBullets.findIndex(b => b.id === bulletId);
    const bullet = jobBullets[currentBulletIndex];

    if (direction === 'up' && currentBulletIndex > 0) {
        // Move up means decreasing order_index
        const temp = bullet.order_index;
        bullet.order_index = jobBullets[currentBulletIndex - 1].order_index;
        jobBullets[currentBulletIndex - 1].order_index = temp;

        // Move DOM element
        const prevBullet = bulletContainer.querySelector(`[data-bullet-id="${jobBullets[currentBulletIndex - 1].id}"]`);
        if (prevBullet) {
            bulletContainer.insertBefore(bulletDiv, prevBullet);
        }
    } else if (direction === 'down' && currentBulletIndex < jobBullets.length - 1) {
        // Move down means increasing order_index
        const temp = bullet.order_index;
        bullet.order_index = jobBullets[currentBulletIndex + 1].order_index;
        jobBullets[currentBulletIndex + 1].order_index = temp;

        // Move DOM element
        const nextBullet = bulletContainer.querySelector(`[data-bullet-id="${jobBullets[currentBulletIndex + 1].id}"]`);
        if (nextBullet && nextBullet.nextSibling) {
            bulletContainer.insertBefore(bulletDiv, nextBullet.nextSibling);
        } else if (nextBullet) {
            bulletContainer.appendChild(bulletDiv);
        }
    }

    // Normalize indices for all bullets in this job
    const allJobBullets = state.bulletPoints.filter(b => b.job_id === jobId);
    normalizeOrderIndices(allJobBullets);

    // Update resume preview only
    updateResume();
}

function duplicateBullet(button) {
    const bulletDiv = button.closest('.bullet-point');
    const jobDiv = bulletDiv.closest('.job');
    const jobId = jobDiv.dataset.jobId;
    const originalBulletId = bulletDiv.dataset.bulletId;

    // Find the original bullet point in state
    const originalBullet = state.bulletPoints.find(bp => bp.id === originalBulletId);
    if (!originalBullet) return;

    // Create new bullet point data
    const newBulletId = generateId();
    const newBullet = {
        id: newBulletId,
        job_id: jobId,
        content: originalBullet.content,
        order_index: originalBullet.order_index // Same order index initially
    };

    // Add to state
    state.bulletPoints.push(newBullet);

    // Shift all bullets after the original down by 1
    state.bulletPoints
        .filter(b => b.job_id === jobId && b.order_index >= originalBullet.order_index)
        .forEach(b => b.order_index++);

    // Add visibility state to all variations
    Object.values(state.variations).forEach(variation => {
        if (!variation.bulletPoints) {
            variation.bulletPoints = [];
        }
        // Set original bullet to invisible and new bullet to visible
        const originalVisibility = variation.bulletPoints.find(bp => bp.bullet_point_id === originalBulletId);
        if (originalVisibility) {
            originalVisibility.is_visible = false;
        }
        variation.bulletPoints.push({
            bullet_point_id: newBulletId,
            is_visible: true
        });
    });

    // Create and insert the new bullet point UI element
    const bulletContainer = bulletDiv.closest('.bulletPointsContainer');
    const newBulletDiv = addBulletPoint(bulletContainer, newBullet, true);

    // Insert the new bullet point before the original one
    bulletDiv.insertAdjacentElement('beforebegin', newBulletDiv);

    // Update checkbox states
    bulletDiv.querySelector('input[type="checkbox"]').checked = false;
    newBulletDiv.querySelector('input[type="checkbox"]').checked = true;

    // Update resume
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
    const bulletIndex = state.bulletPoints.findIndex(b => b.id === bulletId);
    if (bulletIndex > -1) {
        state.bulletPoints.splice(bulletIndex, 1);
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
    // document.querySelector('.variant-name').textContent = variation.name;

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
    state.full_name = document.getElementById('name').value.trim();
    state.contact_info = document.getElementById('contact').value.trim();

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
    if (state.full_name || state.contact_info || variation.bio) {
        contentHTML += `<div class='resume-header'>`;
        if (state.full_name) contentHTML += `<h1>${state.full_name}</h1>`;
        if (state.contact_info) contentHTML += `<p>${linkifyText(state.contact_info)}</p>`;
        if (variation.bio) contentHTML += `<p>${linkifyText(variation.bio)}</p>`;
        contentHTML += `</div>`;
    }

    // Sort sections by order_index
    const sortedSections = [...state.sections].sort((a, b) => a.order_index - b.order_index);

    // Process sections in order
    sortedSections.forEach(section => {
        let sectionHasVisibleContent = false;
        let sectionHTML = `<div class='resume-section' id="preview-section-${section.id}">
                          <h2>${section.name}</h2><div class="section-content">`;

        // Get and sort jobs for this section
        const sectionJobs = state.jobs
            .filter(job => job.section_id === section.id)
            .sort((a, b) => a.order_index - b.order_index);

        sectionJobs.forEach(job => {
            // Get and sort visible bullet points for this job
            const visibleBullets = state.bulletPoints
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
    const resizeHandles = document.querySelectorAll('.resize-handle');
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

    // Add event listeners to all resize handles
    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', function (e) {
            isResizing = true;
            startX = e.pageX;
            startWidth = sidebar.offsetWidth;
            e.preventDefault(); // Prevent text selection

            // Add resize class to improve performance during resize
            sidebar.classList.add('resizing');
        });
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
        localStorage.setItem('userId', data.userId);
        hideAuthModal();
        updateAuthUI();

        // After successful signup, proceed with login to handle resume merging
        await login();
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');

    var mustMerge = false;

    try {
        // Create the login data object
        const loginData = {
            email,
            password
        };

        // Check if we have any content in any variation
        const hasAnyContent = Object.values(state.variations).some(variation =>
            hasContent({
                full_name: state.full_name,
                contact_info: state.contact_info,
                sections: state.sections,
                jobs: state.jobs,
                bulletPoints: state.bulletPoints,
                bio: variation.bio,
                theme: variation.theme,
                spacing: variation.spacing
            })
        );

        // If we have content in any variation, include all state data
        if (hasAnyContent) {
            loginData.existingVariation = {
                full_name: state.full_name,
                contact_info: state.contact_info,
                sections: state.sections,
                jobs: state.jobs,
                bulletPoints: state.bulletPoints,
                variations: state.variations
            };

            mustMerge = true;
        }

        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to log in');
        }

        if (mustMerge) {
            alert("We created a new resume variation, merged, and restored your previous variations.")
            mustMerge = false;
        }

        state.userId = data.userId;
        state.isAuthenticated = true;
        localStorage.setItem('userId', data.userId);
        hideAuthModal();
        updateAuthUI();

        // Load the user's resume from the server
        await loadResume();  // This loads their existing data
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

// Initialize default empty state
function createDefaultState() {
    const defaultVariationId = generateId();
    const defaultSectionId = generateId();
    const defaultJobId = generateId();

    // Create bullet points with IDs first
    const bulletPoints = [
        {
            id: generateId(),
            job_id: defaultJobId,
            content: "💡 Click the + button in the toolbar to create a new variation (e.g., 'Software Focus')",
            order_index: 0
        },
        {
            id: generateId(),
            job_id: defaultJobId,
            content: "✨ Don't forget to save your work! Click 'Save Resume' in the toolbar to keep your changes",
            order_index: 1
        },
        {
            id: generateId(),
            job_id: defaultJobId,
            content: "🎨 Try different themes above to find the perfect look for each job application",
            order_index: 2
        },
        {
            id: generateId(),
            job_id: defaultJobId,
            content: "📌 Click any item in the resume preview to jump to where you can edit it",
            order_index: 3
        },
        {
            id: generateId(),
            job_id: defaultJobId,
            content: "⚡ Never lose your experience again! Use the copy button (⎘) on bullet points to create shorter versions instead of deleting them",
            order_index: 4
        }
    ];

    // Create variation with bullet point visibility
    const defaultVariation = {
        id: defaultVariationId,
        name: 'Default',
        bio: 'Create multiple versions of your resume without losing any experience. Perfect for tailoring to different jobs or industries.',
        theme: 'default',
        spacing: 'relaxed',
        bulletPoints: bulletPoints.map(bp => ({
            bullet_point_id: bp.id,
            is_visible: true  // Make all tutorial bullets visible by default
        }))
    };

    const initialState = {
        full_name: 'Your Name',
        contact_info: 'your@email.com | 123-456-7890 | Website | Your Location',
        sections: [{
            id: defaultSectionId,
            name: "Getting Started",
            order_index: 0
        }],
        jobs: [{
            id: defaultJobId,
            section_id: defaultSectionId,
            title: "Welcome to Your Resume Builder! 👋",
            company: "Here's how to use this tool",
            start_date: "",
            end_date: "",
            order_index: 0
        }],
        bulletPoints: bulletPoints,
        variations: {
            [defaultVariationId]: defaultVariation
        },
        currentVariation: defaultVariationId,
        isDirty: false,
        hasUnsavedChanges: false,
        placeholders: {
            name: "Your full name",
            contact: "Email | Phone | LinkedIn | Location",
            sectionNames: [
                "Experience",
                "Education",
                "Projects",
                "Skills",
                "Publications",
                "Awards"
            ],
            jobTips: {
                title: "Position or Role",
                company: "Company or Organization Name",
                startDate: "Start date (e.g., January 2020)",
                endDate: "End date (or 'Present')"
            },
            bulletTips: [
                "Start with strong action verbs (e.g., Led, Developed, Implemented)",
                "Include measurable achievements (e.g., Increased efficiency by 50%)",
                "Be specific and concise (aim for 1-2 lines per bullet)",
                "Focus on impact and results rather than just responsibilities",
                "Highlight relevant skills and technologies used",
                "Quantify your achievements when possible"
            ]
        }
    };

    return initialState;
}

// Update loadResume function to handle variations properly
async function loadResume() {
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

    // If not authenticated, initialize with default state
    if (!state.isAuthenticated) {
        Object.assign(state, createDefaultState());
        updateUI();
        return;
    }

    try {
        const response = await fetch(`/api/resume/${state.userId}`);
        if (!response.ok) {
            throw new Error('Failed to load resume');
        }

        const data = await response.json();
        console.log('Loaded data:', data, state.userId);

        // Update state with loaded data
        state.full_name = data.full_name || '';
        state.contact_info = data.contact_info || '';
        state.sections = data.sections || [];
        state.jobs = data.jobs || [];
        state.bulletPoints = data.bulletPoints || [];
        state.variations = data.variations || {};

        // Set current variation to first one if not set or if current variation doesn't exist
        if (!state.currentVariation || !state.variations[state.currentVariation]) {
            state.currentVariation = Object.keys(state.variations)[0];
        }

        updateUI();
        state.isDirty = false;
        state.hasUnsavedChanges = false;
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
    document.getElementById('name').value = state.full_name || '';
    document.getElementById('contact').value = state.contact_info || '';

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
    state.sections
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
                    <button onclick="deleteSection(this)" class="delete-job" title="Delete Section">×</button>
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
            const sectionJobs = state.jobs
                .filter(job => job.section_id === section.id)
                .sort((a, b) => a.order_index - b.order_index);

            const jobsContainer = sectionDiv.querySelector('.section-jobs');
            sectionJobs.forEach(job => {
                const jobDiv = addJob(job, true); // Skip state update since job is already in state
                jobsContainer.appendChild(jobDiv);

                // Add bullet points for this job
                const bulletContainer = jobDiv.querySelector('.bulletPointsContainer');
                const jobBullets = state.bulletPoints
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

function deleteJob(button) {
    const jobDiv = button.closest('.job');
    const jobId = jobDiv.dataset.jobId;

    if (!confirm("WARNING: This will delete the job and all its bullet points permanently. Are you sure?")) {
        return;
    }

    // Remove all bullet points for this job
    const bulletPoints = state.bulletPoints.filter(bp => bp.job_id === jobId);
    bulletPoints.forEach(bp => {
        const index = state.bulletPoints.indexOf(bp);
        if (index > -1) {
            state.bulletPoints.splice(index, 1);

            // Remove this bullet point from all variations' bulletPoints arrays
            Object.values(state.variations).forEach(variation => {
                variation.bulletPoints = variation.bulletPoints.filter(
                    bpv => bpv.bullet_point_id !== bp.id
                );
            });
        }
    });

    // Remove job from state
    const jobIndex = state.jobs.findIndex(j => j.id === jobId);
    if (jobIndex > -1) {
        state.jobs.splice(jobIndex, 1);
    }

    // Remove from UI
    jobDiv.remove();
    updateResume();
}

function deleteBulletPoint(button) {
    const bulletDiv = button.closest('.bullet-point');
    const bulletId = bulletDiv.dataset.bulletId;

    if (!confirm("WARNING: This will delete this bullet point permanently. Are you sure?")) {
        return;
    }

    // Remove bullet point from state
    const bulletIndex = state.bulletPoints.findIndex(bp => bp.id === bulletId);
    if (bulletIndex > -1) {
        state.bulletPoints.splice(bulletIndex, 1);

        // Remove this bullet point from all variations' bulletPoints arrays
        Object.values(state.variations).forEach(variation => {
            variation.bulletPoints = variation.bulletPoints.filter(
                bpv => bpv.bullet_point_id !== bulletId
            );
        });
    }

    // Remove from UI
    bulletDiv.remove();
    updateResume();
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
    // Initialize with default state if not authenticated
    if (!state.isAuthenticated) {
        Object.assign(state, createDefaultState());
    }
    loadResume();
});

async function exportToPDF() {
    const element = document.getElementById('resumeContent');
    const currentTheme = document.getElementById('themeSelect').value;

    // if (!state.isAuthenticated) {
    //     showAuthModal();
    //     return; // Don't proceed with save - the login process will handle merging the data
    // }

    // Check if resume has content before proceeding
    const currentVariation = state.variations[state.currentVariation];
    if (!hasContent({
        full_name: state.full_name,
        contact_info: state.contact_info,
        sections: state.sections,
        jobs: state.jobs,
        bulletPoints: state.bulletPoints,
        bio: currentVariation?.bio,
        theme: currentVariation?.theme,
        spacing: currentVariation?.spacing
    })) {
        return;
    }

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
                        border: none !important;
                        border-radius: 0 !important;
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
        const fullName = state.full_name || 'Resume';
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
    const sectionsContainer = document.getElementById('sectionsContainer');

    // Find section in state
    const sections = state.sections;
    const currentIndex = sections.findIndex(s => s.id === sectionId);

    if (direction === 'up' && currentIndex > 0) {
        // Swap order_index with previous section
        const temp = sections[currentIndex].order_index;
        sections[currentIndex].order_index = sections[currentIndex - 1].order_index;
        sections[currentIndex - 1].order_index = temp;

        // Move DOM element
        const prevSection = sectionsContainer.querySelector(`[data-section-id="${sections[currentIndex - 1].id}"]`);
        if (prevSection) {
            sectionsContainer.insertBefore(sectionDiv, prevSection);
        }
    } else if (direction === 'down' && currentIndex < sections.length - 1) {
        // Swap order_index with next section
        const temp = sections[currentIndex].order_index;
        sections[currentIndex].order_index = sections[currentIndex + 1].order_index;
        sections[currentIndex + 1].order_index = temp;

        // Move DOM element
        const nextSection = sectionsContainer.querySelector(`[data-section-id="${sections[currentIndex + 1].id}"]`);
        if (nextSection && nextSection.nextSibling) {
            sectionsContainer.insertBefore(sectionDiv, nextSection.nextSibling);
        } else if (nextSection) {
            sectionsContainer.appendChild(sectionDiv);
        }
    }

    // Normalize indices to ensure they're continuous
    normalizeOrderIndices(sections);

    // Update resume preview only
    updateResume();
}

function deleteSection(button) {
    const sectionDiv = button.closest('.section');
    const sectionId = sectionDiv.dataset.sectionId;

    if (!confirm("WARNING: This will delete the section and all its jobs permanently. Are you sure?")) {
        return;
    }

    // Remove all jobs in this section
    const jobsToRemove = state.jobs.filter(job => job.section_id === sectionId);
    jobsToRemove.forEach(job => {
        // Remove all bullet points for this job
        const bulletPoints = state.bulletPoints.filter(bp => bp.job_id === job.id);
        bulletPoints.forEach(bp => {
            const index = state.bulletPoints.indexOf(bp);
            if (index > -1) {
                state.bulletPoints.splice(index, 1);

                // Remove this bullet point from all variations' bulletPoints arrays
                Object.values(state.variations).forEach(variation => {
                    variation.bulletPoints = variation.bulletPoints.filter(
                        bpv => bpv.bullet_point_id !== bp.id
                    );
                });
            }
        });

        // Remove job
        const index = state.jobs.indexOf(job);
        if (index > -1) {
            state.jobs.splice(index, 1);
        }
    });

    // Remove section from state
    const sectionIndex = state.sections.findIndex(s => s.id === sectionId);
    if (sectionIndex > -1) {
        state.sections.splice(sectionIndex, 1);
    }

    // Remove from UI
    sectionDiv.remove();
    updateResume();
}

// Add section movement functions to window
window.moveSection = moveSection;
window.deleteSection = deleteSection;

async function renameVariation() {

    if (!state.isAuthenticated) {
        alert('Please login to rename a variation');
        return;
    }

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
        // document.querySelector('.variant-name').textContent = newName;

        markUnsavedChanges();
    } catch (error) {
        console.error('Error renaming variation:', error);
        alert(error.message || 'Failed to rename variation');
    }
}

async function deleteVariation() {
    if (!state.isAuthenticated) {
        alert('Please login to delete a variation');
        return;
    }

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
        // toolbarControls.forEach(control => control.style.display = 'none');
    }
}

// Helper function to check if a variation has any content
function hasContent(variation) {
    // Check if there's any actual content, ignoring empty/default values
    const hasActualContent = Boolean(
        variation.full_name?.trim() ||
        variation.contact_info?.trim() ||
        variation.bio?.trim() ||
        (variation.sections && variation.sections.length > 0 && variation.sections.some(s => s.name?.trim())) ||
        (variation.jobs && variation.jobs.length > 0 && variation.jobs.some(j => j.title?.trim() || j.company?.trim())) ||
        (variation.bulletPoints && variation.bulletPoints.length > 0 && variation.bulletPoints.some(b => b.content?.trim()))
    );

    // Only consider theme/spacing changes if there's actual content
    const hasCustomization = hasActualContent && (
        (variation.theme && variation.theme !== 'default') ||
        (variation.spacing && variation.spacing !== 'normal')
    );

    return hasActualContent || hasCustomization;
}

// Function to handle sign out
function signOut() {
    // Clear state
    state.userId = null;
    state.isAuthenticated = false;
    state.full_name = '';
    state.contact_info = '';
    state.sections = [];
    state.jobs = [];
    state.bulletPoints = [];
    state.variations = {};
    state.currentVariation = null;
    state.isDirty = false;
    localStorage.removeItem('userId');  // Remove from localStorage

    // Clear UI elements
    document.getElementById('name').value = '';
    document.getElementById('contact').value = '';
    document.getElementById('bio').value = '';
    document.getElementById('sectionsContainer').innerHTML = '';
    document.getElementById('resumeContent').innerHTML = '';
    document.getElementById('variationSelect').innerHTML = '';

    // Reset theme and spacing to defaults
    document.documentElement.setAttribute('data-theme', 'default');
    document.documentElement.setAttribute('data-spacing', 'normal');
    document.getElementById('themeSelect').value = 'default';
    document.getElementById('spacingSelect').value = 'normal';

    // Initialize with default state
    Object.assign(state, createDefaultState());

    // Update UI elements
    updateAuthUI();
    updateUI();
}

function fillSampleData() {
    // Set basic info
    document.getElementById('name').value = 'Alex Morgan';
    document.getElementById('contact').value = 'alex.morgan@email.com | linkedin.com/in/alexmorgan | github.com/alexmorgan | (555) 123-4567';
    document.getElementById('bio').value = 'Full-stack software engineer with 5+ years of experience building scalable web applications. Passionate about clean code, user experience, and mentoring junior developers.';

    // Create sections
    const experienceSection = addSection({ name: 'Experience', order_index: 0 });
    const educationSection = addSection({ name: 'Education', order_index: 1 });
    const projectsSection = addSection({ name: 'Projects', order_index: 2 });

    // Add jobs to Experience section
    const job1 = {
        id: generateId(),
        section_id: experienceSection.id,
        title: 'Senior Software Engineer',
        company: 'TechCorp Solutions',
        start_date: 'January 2021',
        end_date: 'Present',
        order_index: 0
    };

    const job2 = {
        id: generateId(),
        section_id: experienceSection.id,
        title: 'Software Engineer',
        company: 'InnovateSoft Inc.',
        start_date: 'June 2018',
        end_date: 'December 2020',
        order_index: 1
    };

    // Add jobs to Education section
    const education1 = {
        id: generateId(),
        section_id: educationSection.id,
        title: 'M.S. Computer Science',
        company: 'Tech University',
        start_date: '2016',
        end_date: '2018',
        order_index: 0
    };

    // Add jobs to Projects section
    const project1 = {
        id: generateId(),
        section_id: projectsSection.id,
        title: 'E-commerce Platform Redesign',
        company: 'Open Source Project',
        start_date: '2022',
        end_date: '2023',
        order_index: 0
    };

    // Add jobs to UI
    const job1Div = addJob(job1);
    const job2Div = addJob(job2);
    const educationDiv = addJob(education1);
    const projectDiv = addJob(project1);

    // Add bullet points to jobs
    const job1Bullets = [
        'Led a team of 5 engineers in developing a microservices architecture that reduced system latency by 40%',
        'Implemented CI/CD pipeline using GitHub Actions, reducing deployment time by 60%',
        'Mentored 3 junior developers, leading to their successful promotion to mid-level positions',
        'Architected and deployed cloud-native solutions using AWS, serving 1M+ daily active users'
    ];

    const job2Bullets = [
        'Developed RESTful APIs using Node.js and Express, serving 500k+ daily requests',
        'Optimized MongoDB queries, resulting in 30% faster response times',
        'Collaborated with UX team to implement responsive design principles',
        'Built automated testing suite with 90% code coverage using Jest and React Testing Library'
    ];

    const educationBullets = [
        'GPA: 3.9/4.0',
        'Teaching Assistant for Advanced Algorithms course',
        'Published research paper on distributed systems optimization'
    ];

    const projectBullets = [
        'Built full-stack e-commerce platform using React, Node.js, and PostgreSQL',
        'Implemented secure payment processing using Stripe API',
        'Achieved 98% test coverage and zero critical vulnerabilities'
    ];

    // Function to add bullets with varying visibility
    const addBulletsWithVisibility = (container, bullets, visibilityPattern) => {
        bullets.forEach((text, index) => {
            const bullet = {
                id: generateId(),
                content: text,
                order_index: index
            };
            const bulletDiv = addBulletPoint(container, bullet);
            const checkbox = bulletDiv.querySelector('input[type="checkbox"]');
            checkbox.checked = visibilityPattern[index % visibilityPattern.length];
            checkbox.dispatchEvent(new Event('change'));
        });
    };

    // Add bullets with different visibility patterns
    addBulletsWithVisibility(
        job1Div.querySelector('.bulletPointsContainer'),
        job1Bullets,
        [true, true, false, true] // Varying visibility pattern
    );

    addBulletsWithVisibility(
        job2Div.querySelector('.bulletPointsContainer'),
        job2Bullets,
        [true, false, true, false] // Alternating visibility
    );

    addBulletsWithVisibility(
        educationDiv.querySelector('.bulletPointsContainer'),
        educationBullets,
        [true, true, true] // All visible
    );

    addBulletsWithVisibility(
        projectDiv.querySelector('.bulletPointsContainer'),
        projectBullets,
        [true, false, true] // Mixed visibility
    );

    // Create a second variation
    createNewVariation();
    const secondVariationId = document.getElementById('variationSelect').value;

    // Update bio for second variation
    state.variations[secondVariationId].bio = 'Senior software engineer specializing in cloud architecture and distributed systems. Track record of delivering high-performance solutions at scale.';

    // Switch back to first variation
    document.getElementById('variationSelect').value = state.currentVariation;
    loadVariation(state.currentVariation);

    // Mark changes as unsaved
    markUnsavedChanges();
}

// Make fillSampleData available globally
window.fillSampleData = fillSampleData;
