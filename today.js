navigator.serviceWorker?.addEventListener("message", e => {
  if (e.data?.type === "SW_UPDATED") location.reload();
});

/********************** LOGIN CHECK **********************/
const loggedInEmail = sessionStorage.getItem("userEmail") || localStorage.getItem("userEmail");
const loggedInName = sessionStorage.getItem("userName") || localStorage.getItem("userName");

if (!loggedInEmail) window.location.href = "index.html";

/********************** USER ROLE CONFIG **********************/
// App Head: sees ALL users
const APP_HEAD_EMAIL = "aryan10kumar11@gmail.com";

// Managers: each sees only their listed subordinates.
// To add/remove team members later, just edit this map.
const MANAGER_TEAMS = {
  "rajnish@blueantindia.com": [
    "yogeshyogikushwah@gmail.com", // Yogendra
    "service.desk@blueantindia.com", // Mukesh
    "blueantmf3@gmail.com"            // Monika
  ],
  "avesh@blueantindia.com": [
    "deeppandey38@gmail.com",         // Sudeep
    "vikramaggrawal67@gmail.com",     // Vikram
    "blueantmf4@gmail.com"            // Divya
  ]
};

const IS_APP_HEAD = loggedInEmail === APP_HEAD_EMAIL;
const IS_MANAGER = Object.prototype.hasOwnProperty.call(MANAGER_TEAMS, loggedInEmail);
// True for any user who can switch between viewing other people's data
const HAS_TEAM_VIEW = IS_APP_HEAD || IS_MANAGER;

// Display-name lookup (mirrors login.js USERS list)
const EMAIL_TO_NAME = {
  "avesh@blueantindia.com":        "Avesh",
  "rajnish@blueantindia.com":      "Rajnish",
  "rahul@blueantindia.com":        "Rahul",
  "service.desk@blueantindia.com": "Mukesh",
  "deeppandey38@gmail.com":        "Sudeep",
  "blueantmf3@gmail.com":          "Monika",
  "blueantmf4@gmail.com":          "Divya",
  "vikramaggrawal67@gmail.com":    "Vikram",
  "yogeshyogikushwah@gmail.com":   "Yogendra"
};

/** RMs who get a "90D Pending" tab (same row as Today / Pending / All Clients). */
const TAB_PENDING_90D_EMAILS = new Set([
  "avesh@blueantindia.com",
  "rajnish@blueantindia.com",
  "rahul@blueantindia.com",
  "deeppandey38@gmail.com",
  "vikramaggrawal67@gmail.com",
  "yogeshyogikushwah@gmail.com",
  "service.desk@blueantindia.com"
]);

/** Monika / Divya: same row shows "60D Pending" instead of 90D. */
const TAB_PENDING_60D_EMAILS = new Set([
  "blueantmf3@gmail.com",
  "blueantmf4@gmail.com"
]);

/********************** INACTIVITY HELPERS **********************/
/** Days of inactivity allowed before a client is flagged, by RM email.
 *  Mirrors the same email sets used for the 90D / 60D Pending tab. */
function getInactivityDaysForEmail(email) {
  if (!email) return null;
  if (TAB_PENDING_90D_EMAILS.has(email)) return 90;
  if (TAB_PENDING_60D_EMAILS.has(email)) return 60;
  return null;
}

/** Inactive = no last_interaction at all, OR last_interaction is >= N days old. */
function isInactive(lead, today, days) {
  if (!lead._lastInteraction) return true;                       // blank / null
  const diffDays = Math.floor((today - lead._lastInteraction) / 86400000);
  return diffDays >= days;
}

let selectedUserEmail = null; // used only when HAS_TEAM_VIEW

/********************** SUPABASE CONFIG **********************/

const SUPABASE_URL = "https://mobayfadyaukpukpjwnp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vYmF5ZmFkeWF1a3B1a3Bqd25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTUxNzMsImV4cCI6MjA5MTE5MTE3M30.6lgBpK1_6xVyG0OGyf94mErj6BtX8K7QVvtFi0mh6OI";

/********************** DOM **********************/
const loader = document.getElementById("loader");
const list = document.getElementById("list");
const searchInput = document.getElementById("search");
const tabButtons = document.querySelectorAll(".tab-button");
const filterSlider = document.getElementById("filterSlider");
const pageTitle = document.getElementById("pageTitle");
const subFiltersDiv = document.getElementById("subFilters");
const subFilterBtns = document.querySelectorAll(".sub-filter-btn");

/********************** INIT HEADER **********************/
document.getElementById("date").innerText = new Date().toDateString();
if (pageTitle && loggedInName) pageTitle.innerText = loggedInName;

/********************** STATE **********************/
let allData = [];
let filteredData = [];
let selectedDateFilter = "today";
let selectedSubFilter = "followup"; // default sub-filter

const PAGE_SIZE = 50;
let visibleCount = PAGE_SIZE;

/********************** LOADER **********************/
function showLoader() {
  loader.style.display = "flex";
}
function hideLoader() {
  loader.style.display = "none";
}

/********************** HTML / URL ESCAPING (XSS PROTECTION) **********************/
// Escapes special HTML characters so user data can be safely interpolated
// into innerHTML without executing as code.
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow safe URL schemes (blocks javascript:, data:, etc.)
function safeUrl(url) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/)/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return "#";
}

// Strip non-digits from phone (avoids broken tel:/wa.me URLs)
function sanitizePhone(mobile) {
  if (!mobile) return "";
  return String(mobile).replace(/\D/g, "");
}

/********************** DATE FUNCTIONS **********************/
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Split manually to avoid UTC timezone shift
  const parts = String(dateStr).split("T")[0].split("-");
  if (parts.length < 3) return null;

  const d = new Date(
    parseInt(parts[0], 10),      // year
    parseInt(parts[1], 10) - 1,  // month
    parseInt(parts[2], 10)       // day
  );

  if (isNaN(d)) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("en-GB");
}

/********************** REMARK SHORTENER **********************/
function getShortText(text, wordLimit = 20) {
  if (!text) return { short: "-", full: "-" };

  const words = text.split(" ");
  if (words.length <= wordLimit) {
    return { short: text, full: text };
  }

  return {
    short: words.slice(0, wordLimit).join(" ") + "...",
    full: text
  };
}

/********************** FETCH DATA **********************/
function fetchData() {
  // App Head: do nothing until a user tab is selected (Aryan has no own data)
  if (IS_APP_HEAD && !selectedUserEmail) {
    list.innerHTML = "";
    return;
  }
  const emailToFetch = selectedUserEmail || loggedInEmail;

  showLoader();
  list.innerHTML = "<p>Loading...</p>";

  fetch(`${SUPABASE_URL}/rest/v1/filtered_crm_data?rm_crm_email=eq.${encodeURIComponent(emailToFetch)}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  })
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return res.json();
    })
    .then(data => {
      // Defend against unexpected response shape
      if (!Array.isArray(data)) {
        throw new Error("Unexpected response format from server");
      }

      allData = data.map(l => ({
        id: l.pan_number,
        name: l.client_name,
        mobile: l.client_mobile,
        updateLink: l.update_link,
        leadStatus: l.last_interaction_remarks ?? "",
        lastInteraction: l.last_interaction_timestamp ?? "",
        type: l.interaction_type?.toLowerCase(),
        nextPlanDate: l.next_follow_up,
        _nextPlanDate: parseDate(l.next_follow_up),
        _validFollowUp: parseDate(l.valid_follow_up),
        _validNextInteraction: parseDate(l.valid_next_interaction),
        _lastInteraction: parseDate(l.last_interaction_timestamp)   // for inactivity tab
      }));

      updateCounts();
      applyFilters();
      hideLoader();
    })
    .catch(err => {
      console.error("fetchData failed:", err);
      list.innerHTML = "<p>Failed to load data</p>";
      hideLoader();
    });
}

/********************** TEAM-VIEW USER TABS (App Head + Managers) **********************/
function initTeamView() {
  const container = document.getElementById("userTabs");
  if (!container) return;

  container.style.display = "flex";
  container.innerHTML = "<span class='user-tab-loading'>Loading users…</span>";

  // Render the list of clickable user tabs
  const renderTabs = (emails) => {
    container.innerHTML = "";

    if (!emails.length) {
      container.innerHTML = "<span class='user-tab-loading'>No users found</span>";
      syncExtendedPendingTab();
      return;
    }

    // Sort alphabetically by display name for consistency
    emails.sort((a, b) => {
      const na = EMAIL_TO_NAME[a] || a;
      const nb = EMAIL_TO_NAME[b] || b;
      return na.localeCompare(nb);
    });

    emails.forEach(email => {
      const displayName = EMAIL_TO_NAME[email] || email;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "user-tab-btn";
      btn.textContent = displayName; // textContent is XSS-safe
      btn.dataset.email = email;

      btn.addEventListener("click", () => {
        // Toggle: click same btn again → deselect
        if (selectedUserEmail === email) {
          selectedUserEmail = null;
          document.querySelectorAll(".user-tab-btn").forEach(b => b.classList.remove("active"));

          // App Head has no own data — clear the screen.
          // Manager has own data — reload it.
          if (IS_APP_HEAD) {
            allData = [];
            filteredData = [];
            updateCounts();
            list.innerHTML = "";
            syncExtendedPendingTab();
          } else {
            // Reset filters and fetch the manager's own data
            selectedDateFilter = "today";
            selectedSubFilter = "followup";
            setDateFilter("today");
            searchInput.value = "";
            syncExtendedPendingTab();
            fetchData();
          }
          return;
        }

        selectedUserEmail = email;
        document.querySelectorAll(".user-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Reset filters to default on user switch
        selectedDateFilter = "today";
        selectedSubFilter = "followup";
        setDateFilter("today");
        searchInput.value = "";

        syncExtendedPendingTab();
        fetchData();
      });

      container.appendChild(btn);
    });

    syncExtendedPendingTab();
  };

  if (IS_MANAGER) {
    // Manager: show only their team members (instant — no DB call needed)
    const team = MANAGER_TEAMS[loggedInEmail] || [];
    renderTabs(team);
    return;
  }

  // App Head: fetch all unique emails from DB
  fetch(`${SUPABASE_URL}/rest/v1/filtered_crm_data?select=rm_crm_email`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  })
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return res.json();
    })
    .then(rows => {
      if (!Array.isArray(rows)) {
        throw new Error("Unexpected response format");
      }
      const uniqueEmails = [...new Set(
        rows.map(r => r.rm_crm_email).filter(e => e && e !== loggedInEmail)
      )];
      renderTabs(uniqueEmails);
    })
    .catch(err => {
      console.error("Failed to load user list:", err);
      container.innerHTML = "<span class='user-tab-loading'>Failed to load users</span>";
      syncExtendedPendingTab();
    });
}

/********************** EXTENDED PENDING TAB (90D / 60D by RM) **********************/
function getEffectiveRmEmailForFilters() {
  if (IS_APP_HEAD) return selectedUserEmail || null;
  return selectedUserEmail || loggedInEmail;
}

/** Matches tab-badge logic for pending-style windows (either follow-up date may qualify). */
function countPendingLike(l, today, meetingMaxDays, phoneMaxDays) {
  const dates = [l._validFollowUp, l._validNextInteraction];
  return dates.some(date => {
    if (!date) return false;
    if (date >= today) return false;
    if (l.leadStatus === "Lost" || l.leadStatus === "Completed") return false;
    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));
    if (l.type === "meeting") return diffDays <= meetingMaxDays;
    if (l.type === "phone call") return diffDays <= phoneMaxDays;
    return false;
  });
}

/** Row filter using active sub-tab (follow-up vs next interaction). */
function rowMatchesPendingWindow(l, today, meetingMaxDays, phoneMaxDays) {
  const dateToCheck = selectedSubFilter === "interaction"
    ? l._validNextInteraction
    : l._validFollowUp;

  if (!dateToCheck) return false;
  if (dateToCheck >= today) return false;
  if (l.leadStatus === "Lost" || l.leadStatus === "Completed") return false;
  const diffDays = Math.floor((today - dateToCheck) / (1000 * 60 * 60 * 24));
  if (l.type === "meeting") return diffDays <= meetingMaxDays;
  if (l.type === "phone call") return diffDays <= phoneMaxDays;
  return false;
}

function syncExtendedPendingTab() {
  const btn = document.getElementById("tabPendingExtended");
  if (!btn) return;

  const email = getEffectiveRmEmailForFilters();
  let mode = null;
  if (email) {
    if (TAB_PENDING_90D_EMAILS.has(email)) mode = "90";
    else if (TAB_PENDING_60D_EMAILS.has(email)) mode = "60";
  }

  const newFilterKey = mode === "90" ? "pending90" : "pending60";

  if (!mode) {
    btn.hidden = true;
    if (selectedDateFilter === "pending90" || selectedDateFilter === "pending60") {
      setDateFilter("today");
    }
    updateCounts();
    updateTabSlider();
    return;
  }

  btn.hidden = false;
  btn.dataset.filter = newFilterKey;

  if (
    (selectedDateFilter === "pending90" || selectedDateFilter === "pending60") &&
    selectedDateFilter !== newFilterKey
  ) {
    setDateFilter("today");
  }

  updateCounts();
  updateTabSlider();
}

/********************** COUNTS **********************/
function updateCounts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allCount = allData.length;

  const todayCount = allData.filter(l =>
    (l._validFollowUp && l._validFollowUp.getTime() === today.getTime()) ||
    (l._validNextInteraction && l._validNextInteraction.getTime() === today.getTime())
  ).length;

  const pendingCount = allData.filter(l => countPendingLike(l, today, 60, 30)).length;

  document.getElementById("tabAll").innerText = `All Clients (${allCount})`;
  document.getElementById("tabToday").innerText = `Today (${todayCount})`;
  document.getElementById("tabPending").innerText = `Pending (${pendingCount})`;

  // 90D / 60D Pending tab now reflects INACTIVITY (no interaction within N days)
  const extTab = document.getElementById("tabPendingExtended");
  if (extTab && !extTab.hidden) {
    const email = getEffectiveRmEmailForFilters();
    const days  = getInactivityDaysForEmail(email);
    const is90  = extTab.dataset.filter === "pending90";
    const extCount = (days == null)
      ? 0
      : allData.filter(l => isInactive(l, today, days)).length;
    extTab.innerText = is90 ? `90D Pending (${extCount})` : `60D Pending (${extCount})`;
  }
}

/********************** FILTER **********************/
function applyFilters() {
  visibleCount = PAGE_SIZE;

  const searchText = searchInput.value.toLowerCase();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  filteredData = allData.filter(l => {

    // Search applies on all tabs
    if (searchText &&
      !((l.name && l.name.toLowerCase().includes(searchText)) ||
        String(l.mobile || "").includes(searchText) ||
        (l.id && l.id.toLowerCase().includes(searchText)))) return false;

    if (selectedDateFilter === "today") {
      const dateToCheck = selectedSubFilter === "interaction"
        ? l._validNextInteraction
        : l._validFollowUp;

      return dateToCheck && dateToCheck.getTime() === today.getTime();
    }

    // Regular Pending tab keeps the original overdue-follow-up logic
    if (selectedDateFilter === "pending") {
      return rowMatchesPendingWindow(l, today, 60, 30);
    }

    // 90D / 60D Pending tabs now use INACTIVITY logic
    // (last_interaction_timestamp is blank, or older than/equal to threshold)
    if (selectedDateFilter === "pending90" || selectedDateFilter === "pending60") {
      const email = getEffectiveRmEmailForFilters();
      const days  = getInactivityDaysForEmail(email);
      if (days == null) return false;
      return isInactive(l, today, days);
    }

    return true;
  });

  render();
}

/********************** TAB **********************/
function updateTabSlider() {
  const activeButton = document.querySelector(".tab-button.active");
  if (!activeButton) return;

  const rect = activeButton.getBoundingClientRect();
  const parentRect = activeButton.parentElement.getBoundingClientRect();
  const offset = rect.left - parentRect.left;

  filterSlider.style.width = `${rect.width}px`;
  filterSlider.style.transform = `translateX(${offset}px)`;
}

function setDateFilter(value) {
  selectedDateFilter = value;

  tabButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === value);
  });

  // Sub-filters only make sense for Today and regular Pending.
  // Inactivity (90D/60D Pending) uses last_interaction only — sub-filter would be misleading.
  const showSubFilters =
    value === "today" ||
    value === "pending";
  subFiltersDiv.style.display = showSubFilters ? "flex" : "none";

  // Toggle the list-wrapper class so CSS can close the gap on All Clients tab
  const listWrapper = document.querySelector(".list-wrapper");
  if (listWrapper) {
    listWrapper.classList.toggle("no-subfilters", !showSubFilters);
  }

  updateTabSlider();
  applyFilters();
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => setDateFilter(btn.dataset.filter));
});

window.addEventListener("resize", updateTabSlider);

/********************** SUB-FILTER **********************/
subFilterBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    subFilterBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSubFilter = btn.dataset.type;
    applyFilters();
  });
});

// Set default active sub-filter button on load
document.querySelector(`.sub-filter-btn[data-type="${selectedSubFilter}"]`)?.classList.add("active");

/********************** SEARCH **********************/
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 300);
});

/********************** LOAD MORE **********************/
function loadMore() {
  visibleCount += PAGE_SIZE;
  render();
}

/********************** RENDER **********************/
function render() {
  list.innerHTML = "";

  if (!filteredData.length) {
    list.innerHTML = "<p>No records found</p>";
    return;
  }

  const slice = filteredData.slice(0, visibleCount);
  const frag = document.createDocumentFragment();

  // True when we're viewing the inactivity tabs — drives the red/gray highlight
  const isInactivityView =
    selectedDateFilter === "pending90" || selectedDateFilter === "pending60";

  slice.forEach(l => {

    const remarkObj = getShortText(l.leadStatus);

    const safeName       = escapeHtml(l.name || "-");
    const safeId         = escapeHtml(l.id || "-");
    const safePhone      = sanitizePhone(l.mobile);
    const telHref        = safePhone ? `tel:${safePhone}` : "#";
    const waHref         = safePhone ? `https://wa.me/91${safePhone}` : "#";
    const safeUpdateLink = safeUrl(l.updateLink);
    const safeLastDate   = escapeHtml(formatDate(l.lastInteraction));
    const safeShortText  = escapeHtml(remarkObj.short);
    const safeFullText   = escapeHtml(remarkObj.full);

    const div = document.createElement("div");
    div.className = "lead-card";

    // Highlight: gray = no last_interaction recorded, red = beyond inactivity window
    if (isInactivityView) {
  div.classList.add(l._lastInteraction ? "inactive-red" : "inactive-gray");
} else if (selectedDateFilter === "all") {
  div.classList.add("tab-all");
} else if (selectedDateFilter === "today") {
  div.classList.add("tab-today");
} else if (selectedDateFilter === "pending") {
  div.classList.add("tab-pending");
}

    div.innerHTML = `
      <div class="card-top">
        <div class="left">
          <div class="name">${safeName}</div>
          <div class="pan">PAN - ${safeId}</div>
        </div>

        <div class="actions">
          <a href="${telHref}" class="icon">📞</a>
          <a href="${waHref}" target="_blank" rel="noopener noreferrer" class="icon">
            <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" class="whatsapp-icon-new" alt="WhatsApp">
          </a>
          <a href="${safeUpdateLink}" target="_blank" rel="noopener noreferrer" class="update-btn">Update Form</a>
        </div>
      </div>

      <div class="divider"></div>

      <div class="card-bottom">
        <div class="last-date">
          <div class="label">Last Interaction</div>
          <div class="value">${safeLastDate}</div>
        </div>

        <div class="remarks" data-full="${safeFullText}" data-short="${safeShortText}">
          <span class="remark-text">${safeShortText}</span>
          ${remarkObj.short !== remarkObj.full ? `<span class="read-more"> Read more</span>` : ""}
        </div>
      </div>
    `;

    frag.appendChild(div);
  });

  list.appendChild(frag);
  renderLoadMore();
}

/********************** READ MORE CLICK **********************/
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("read-more")) {

    const parent = e.target.parentElement;
    const textEl = parent.querySelector(".remark-text");

    if (e.target.innerText.trim() === "Read more") {
      // dataset returns the decoded original text — safe to set via innerText
      textEl.innerText = parent.dataset.full;
      e.target.innerText = " Show less";
    } else {
      textEl.innerText = parent.dataset.short;
      e.target.innerText = " Read more";
    }
  }
});

/********************** LOAD MORE BTN **********************/
function renderLoadMore() {
  let btn = document.getElementById("loadMoreBtn");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "loadMoreBtn";
    btn.innerText = "Load More";
    btn.onclick = loadMore;
    list.after(btn);
  }

  btn.style.display =
    visibleCount < filteredData.length ? "block" : "none";
}

/********************** INIT **********************/
if (HAS_TEAM_VIEW) initTeamView();
else syncExtendedPendingTab();
setTimeout(updateTabSlider, 0);
if (!IS_APP_HEAD) fetchData();