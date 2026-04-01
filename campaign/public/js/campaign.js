/**
 * Campaign Module
 * Loads and renders dynamic campaign data from the server
 */

let campaignData = null;

function formatAmount(amount) {
  return (typeof currency !== 'undefined' && currency.loaded) 
    ? currency.format(amount, false) 
    : `€${parseFloat(amount).toLocaleString()}`;
}

async function loadCampaignData() {
  try {
    if (window.__CAMPAIGN_DATA) {
      campaignData = window.__CAMPAIGN_DATA;
      window.__CAMPAIGN_DATA = null;
      return campaignData;
    }
    if (window._prefetchedCampaign) {
      campaignData = window._prefetchedCampaign;
      window._prefetchedCampaign = null;
      return campaignData;
    }
    const response = await fetch('/api/campaign');
    if (!response.ok) throw new Error('Failed to load campaign');
    campaignData = await response.json();
    return campaignData;
  } catch (error) {
    console.error('Error loading campaign:', error);
    return null;
  }
}

function renderCampaign(data) {
  if (!data) return;
  
  // Update page title and meta
  document.title = `${data.title} | Fundraiser Campaign`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = data.description;
  
  renderGallery(data.images);
  renderTitle(data.title);
  renderOrganizer(data.organizer);
  renderProgress(data.raised, data.goal, data.donorCount, data.daysLeft);
  renderStory(data.story);
  renderUpdates(data.updates);
  renderMilestones(data.milestones);
  renderTopDonors(data.topDonors);
  renderDonorsList(data.recentDonors, data.donorCount);
}

function renderGallery(images) {
  if (!images || images.length === 0) return;
  
  const mainWrapper = document.querySelector('.gallery-main .swiper-wrapper');
  if (mainWrapper) {
    mainWrapper.innerHTML = images.map(img => `
      <div class="swiper-slide">
        <img src="${img.url}" alt="${img.alt}" class="w-full h-[300px] md:h-[400px] object-cover rounded-2xl">
      </div>
    `).join('');
  }
  
  const thumbWrapper = document.querySelector('.gallery-thumbs .swiper-wrapper');
  if (thumbWrapper) {
    thumbWrapper.innerHTML = images.map((img, i) => `
      <div class="swiper-slide cursor-pointer">
        <img src="${img.thumb}" alt="Thumb ${i + 1}" class="w-full h-16 object-cover rounded-lg opacity-70 hover:opacity-100 transition-opacity">
      </div>
    `).join('');
  }
}

function renderTitle(title) {
  document.querySelectorAll('[data-campaign="title"]').forEach(el => {
    el.textContent = title;
  });
}

function renderOrganizer(organizer) {
  document.querySelectorAll('[data-campaign="organizer-name"]').forEach(el => {
    el.textContent = organizer.name;
  });
  document.querySelectorAll('[data-campaign="organizer-initials"]').forEach(el => {
    el.textContent = organizer.initials;
  });
  document.querySelectorAll('[data-campaign="organizer-location"]').forEach(el => {
    el.textContent = organizer.location;
  });
  document.querySelectorAll('[data-campaign="organizer-date"]').forEach(el => {
    el.textContent = organizer.createdDate;
  });
}

function renderProgress(raised, goal, donorCount, daysLeft) {
  const percentage = Math.min(Math.round((raised / goal) * 100), 100);
  
  // Update ALL counters - find by data-stat wrapper OR by parent context
  document.querySelectorAll('[data-stat="raised"] .counter').forEach(el => {
    el.dataset.target = raised;
  });
  document.querySelectorAll('[data-stat="donors"] .counter').forEach(el => {
    el.dataset.target = donorCount;
  });
  document.querySelectorAll('[data-stat="days"] .counter').forEach(el => {
    el.dataset.target = daysLeft;
  });
  
  // Update progress bars
  document.querySelectorAll('.progress-bar').forEach(el => {
    el.dataset.target = percentage;
  });
  
  // Update goal text
  document.querySelectorAll('[data-campaign="goal"]').forEach(el => {
    el.textContent = formatAmount(goal);
  });
  
  // Update donor count badge
  document.querySelectorAll('[data-campaign="donor-count"]').forEach(el => {
    el.textContent = donorCount.toLocaleString();
  });
  
  // Update all-donors-count
  document.querySelectorAll('[data-campaign="all-donors-count"]').forEach(el => {
    el.textContent = donorCount.toLocaleString();
  });
  
  // Update mobile donate bar
  document.querySelectorAll('[data-campaign="bar-raised"]').forEach(el => {
    el.textContent = `${formatAmount(raised)} raised`;
  });
  document.querySelectorAll('[data-campaign="bar-goal"]').forEach(el => {
    el.textContent = `of ${formatAmount(goal)} goal`;
  });
}

const sectionIcons = {
  diagnosis: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z"/></svg>',
  treatment: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/></svg>',
  hope: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/></svg>',
  help: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/></svg>',
  cost: '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/></svg>'
};

function renderStory(story) {
  if (!story) return;
  
  document.querySelectorAll('[data-campaign="story-intro"]').forEach(el => {
    el.textContent = story.intro;
  });
  
  const storyFull = document.getElementById('story-full');
  if (storyFull && story.sections) {
    let html = '';
    story.sections.forEach((section, idx) => {
      const iconSvg = section.icon && sectionIcons[section.icon] ? sectionIcons[section.icon] : '';

      html += `<div class="mt-8 ${idx === 0 ? 'mt-6' : ''} bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">`;

      html += `<div class="flex items-center gap-3 px-5 pt-5 pb-3">`;
      if (iconSvg) {
        html += `<div class="w-9 h-9 rounded-xl bg-gfm-green-light flex items-center justify-center text-gfm-green flex-shrink-0">${iconSvg}</div>`;
      }
      html += `<h3 class="text-base font-bold text-gfm-dark leading-snug">${section.title}</h3>`;
      html += `</div>`;

      html += `<div class="px-5 pb-5">`;

      if (section.content) {
        const paragraphs = section.content.split('\n\n');
        paragraphs.forEach(p => {
          if (p.trim()) {
            html += `<p class="text-gfm-gray text-[15px] leading-[1.75] mb-3 last:mb-0">${p.trim()}</p>`;
          }
        });
      }

      if (section.coveredItems) {
        const coveredLabel = section.coveredLabel || 'Covered';
        html += `<div class="bg-emerald-50 rounded-xl p-4 mb-3 border border-emerald-200/60"><p class="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2.5">${coveredLabel}</p><ul class="space-y-2.5">`;
        section.coveredItems.forEach(item => {
          html += `<li class="flex items-start gap-2.5 text-sm">
            <span class="text-emerald-500 mt-0.5 flex-shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            </span>
            <span class="text-gray-600">${item}</span>
          </li>`;
        });
        html += '</ul></div>';
      }

      if (section.notCoveredItems) {
        const notCoveredLabel = section.notCoveredLabel || 'Not covered';
        html += `<div class="bg-red-50 rounded-xl p-4 mb-0 border border-red-200/60"><p class="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2.5">${notCoveredLabel}</p><ul class="space-y-2.5">`;
        section.notCoveredItems.forEach(item => {
          html += `<li class="flex items-start gap-2.5 text-sm">
            <span class="text-red-400 mt-0.5 flex-shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </span>
            <span class="text-gray-600">${item}</span>
          </li>`;
        });
        html += '</ul></div>';
      }

      if (section.items) {
        html += '<div class="bg-gfm-green-light rounded-xl p-4 mb-0"><ul class="space-y-3">';
        section.items.forEach(item => {
          html += `<li class="flex justify-between items-start gap-3 text-sm">
            <span class="text-gfm-gray leading-snug">${item.text}</span>
            <span class="font-bold text-gfm-green whitespace-nowrap">${formatAmount(item.amount)}</span>
          </li>`;
        });
        let total = section.items.reduce((sum, i) => sum + i.amount, 0);
        const totalLabel = section.totalLabel || 'Total';
        html += `</ul><div class="mt-3 pt-3 border-t border-gfm-green/20 flex justify-between items-center">
          <span class="text-sm font-semibold text-gfm-dark">${totalLabel}</span>
          <span class="text-base font-bold text-gfm-green">${formatAmount(total)}</span>
        </div></div>`;
      }

      html += `</div></div>`;
    });

    if (story.quote) {
      html += `
        <div class="mt-8 bg-gradient-to-br from-gfm-green-light to-emerald-50 rounded-2xl p-6 border border-emerald-200/40 relative">
          <div class="absolute top-4 left-5 text-gfm-green/20">
            <svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983z"/></svg>
          </div>
          <blockquote class="relative pt-8">
            <p class="text-gfm-dark text-[15px] leading-[1.8] italic">"${story.quote.text}"</p>
            <footer class="mt-4 flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gfm-green flex items-center justify-center text-white text-xs font-bold">${story.quote.author.charAt(0)}</div>
              <span class="font-semibold text-gfm-dark text-sm">${story.quote.author}</span>
            </footer>
          </blockquote>
        </div>
      `;
    }
    storyFull.innerHTML = html;
  }
}

function renderUpdates(updates) {
  if (!updates || updates.length === 0) return;
  const container = document.getElementById('updates-list');
  if (!container) return;
  
  container.innerHTML = updates.map(update => `
    <div class="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-lg transition-shadow">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-gfm-green to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          ${campaignData.organizer.initials}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-bold text-gfm-dark text-sm">${campaignData.organizer.name}</span>
            <span class="text-xs text-gfm-gray">• ${update.date}</span>
            ${update.isNew ? '<span class="bg-gfm-green text-white text-xs px-2 py-0.5 rounded-full">New</span>' : ''}
          </div>
          <h4 class="font-bold text-gfm-dark mb-2">${update.title}</h4>
          <p class="text-gfm-gray text-sm leading-relaxed">${update.content}</p>
        </div>
      </div>
    </div>
  `).join('');
}

function renderMilestones(milestones) {
  if (!milestones || milestones.length === 0) return;
  const container = document.getElementById('milestones-list');
  if (!container) return;
  
  container.innerHTML = milestones.map(milestone => `
    <div class="flex items-center gap-3 ${milestone.reached ? '' : 'opacity-50'}">
      <div class="w-8 h-8 rounded-full ${milestone.reached ? 'bg-gfm-green' : 'bg-gray-200'} flex items-center justify-center flex-shrink-0">
        ${milestone.reached 
          ? '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
          : '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg>'
        }
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm ${milestone.reached ? 'text-gfm-dark' : 'text-gfm-gray'}">${milestone.label}</p>
        <p class="text-xs text-gfm-gray">${formatAmount(milestone.amount)}</p>
      </div>
    </div>
  `).join('');
}

function renderTopDonors(topDonors) {
  if (!topDonors || topDonors.length === 0) return;
  const colors = ['from-amber-50 to-amber-100/50', 'from-gray-50 to-gray-100/50', 'from-orange-50 to-orange-100/50'];
  const borders = ['border-amber-200/50', 'border-gray-200/50', 'border-orange-200/50'];
  const emojis = ['🥇', '🥈', '🥉'];
  
  const container = document.getElementById('top-donors-list');
  if (!container) return;
  
  container.innerHTML = topDonors.slice(0, 3).map((donor, i) => `
    <div class="bg-gradient-to-br ${colors[i]} rounded-xl p-3 border ${borders[i]}">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-gradient-to-br ${donor.color} flex items-center justify-center text-white font-bold text-xs">${emojis[i]}</div>
        <div>
          <p class="font-semibold text-gfm-dark text-sm">${donor.name}</p>
          <p class="text-gfm-green font-bold text-sm">${formatAmount(donor.amount)}</p>
        </div>
      </div>
    </div>
  `).join('');
}

function renderDonorsList(donors, totalCount) {
  if (!donors || donors.length === 0) return;
  const container = document.getElementById('donors-list');
  if (!container) return;
  
  // Show first 10 donors initially
  const initialCount = 10;
  container.innerHTML = donors.slice(0, initialCount).map(donor => `
    <div class="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br ${donor.color} flex items-center justify-center text-white font-bold flex-shrink-0">${donor.initials}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold text-gfm-dark truncate">${donor.name}</span>
            <span class="font-bold text-gfm-green flex-shrink-0">${formatAmount(donor.amount)}</span>
          </div>
          <p class="text-sm text-gfm-gray">${donor.time}</p>
          ${donor.message ? `<p class="text-gfm-gray mt-2 text-sm italic truncate">"${donor.message}"</p>` : ''}
        </div>
      </div>
    </div>
  `).join('');
  
  // Store remaining donors (next 10) for "show more" button
  window.remainingDonors = donors.slice(initialCount, 20);
  
  // Hide button if no more donors to show
  const loadMoreBtn = document.getElementById('load-more-donors');
  if (loadMoreBtn && window.remainingDonors.length === 0) {
    loadMoreBtn.style.display = 'none';
  }
  
  // Update "All Donors" header
  document.querySelectorAll('[data-campaign="all-donors-count"]').forEach(el => {
    el.textContent = totalCount.toLocaleString();
  });
}

window.loadCampaignData = loadCampaignData;
window.renderCampaign = renderCampaign;
window.campaignData = () => campaignData;
