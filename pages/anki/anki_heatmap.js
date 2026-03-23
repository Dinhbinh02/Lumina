/**
 * Anki Heatmap Integration for Lumina
 */

class AnkiHeatmap {
    constructor() {
        this.anki = null;
        this.reviewData = {}; // timestamp -> count
        this.rawReviews = []; // [{id, cardId, ease, ...}, ...]
        this.stats = {
            dailyAvg: 0,
            daysLearned: 0,
            longestStreak: 0,
            currentStreak: 0
        };
        this.cal = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        this.anki = window.anki; // From anki.js
        if (!this.anki) {
            console.error("Anki Heatmap: window.anki not found");
            return;
        }

        await this.refresh();
        this.setupEventListeners();
        this.isInitialized = true;
    }

    setupEventListeners() {
        const modal = document.getElementById('heatmapDetailsModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }
    }

    async refresh() {
        try {
            console.log("Anki Heatmap: refreshing...");
            await this.fetchData();
            console.log("Anki Heatmap: Data fetched, count:", Object.keys(this.reviewData).length);
            this.calculateStats();
            this.render();
            this.updateUI();
            console.log("Anki Heatmap: Render complete.");
        } catch (error) {
            console.error("Anki Heatmap error:", error);
        }
    }

    async fetchData() {
        // Fetch cards that have reviews OR are in our special streak fixer deck
        const query = "deck:* prop:reps>0 OR deck:\"Lumina\"";
        const cardIds = await this.anki.invoke('findCards', { query: query });
        console.log("Anki Heatmap: Found card IDs to check:", cardIds?.length);
        if (!cardIds || cardIds.length === 0) {
            console.log("Anki Heatmap: No cards with reviews found.");
            return;
        }

        // Fetch reviews in chunks
        const CHUNK_SIZE = 1000;
        const processedData = {};
        const allRevs = [];

        for (let i = 0; i < cardIds.length; i += CHUNK_SIZE) {
            const chunkIds = cardIds.slice(i, i + CHUNK_SIZE);
            try {
                const reviewsMap = await this.anki.getReviewsOfCards(chunkIds);
                const keys = Object.keys(reviewsMap || {});
                console.log(`Anki Heatmap: Chunk ${i} returned reviews for ${keys.length} cards`);
                
                for (const cardId of keys) {
                    const cardRevs = reviewsMap[cardId];
                    if (Array.isArray(cardRevs)) {
                        cardRevs.forEach(rev => {
                            const date = new Date(rev.id);
                            date.setHours(0, 0, 0, 0);
                            const ts = Math.floor(date.getTime() / 1000);
                            
                            processedData[ts] = (processedData[ts] || 0) + 1;
                            allRevs.push({
                                ...rev,
                                cardId: parseInt(cardId),
                                dateTs: ts
                            });
                        });
                    }
                }
            } catch (e) {
                console.warn(`Failed to fetch reviews for chunk ${i}:`, e);
            }
        }

        this.reviewData = processedData;
        this.rawReviews = allRevs;
    }

    calculateStats() {
        const uniqueDays = Object.keys(this.reviewData).map(Number).sort((a, b) => a - b);
        if (uniqueDays.length === 0) return;

        this.stats.daysLearned = uniqueDays.length;
        
        const totalReviews = Object.values(this.reviewData).reduce((a, b) => a + b, 0);
        this.stats.dailyAvg = Math.round(totalReviews / uniqueDays.length);

        // Longest Streak
        let longest = 0;
        let tempStreak = 0;
        for (let i = 0; i < uniqueDays.length; i++) {
            if (i > 0 && uniqueDays[i] === uniqueDays[i-1] + 86400) {
                tempStreak++;
            } else {
                tempStreak = 1;
            }
            if (tempStreak > longest) longest = tempStreak;
        }

        // Current Streak
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayTs = Math.floor(today.getTime() / 1000);
        const yesterdayTs = todayTs - 86400;

        let current = 0;
        if (uniqueDays.includes(todayTs) || uniqueDays.includes(yesterdayTs)) {
            let checkTs = uniqueDays.includes(todayTs) ? todayTs : yesterdayTs;
            let idx = uniqueDays.indexOf(checkTs);
            while (idx >= 0 && uniqueDays[idx] === checkTs) {
                current++;
                checkTs -= 86400;
                idx = uniqueDays.indexOf(checkTs);
            }
        }

        this.stats.longestStreak = longest;
        this.stats.currentStreak = current;
    }

    render() {
        const container = document.getElementById('cal-heatmap');
        if (!container) return;
        
        // Destroy existing instance if any
        if (this.cal) {
            try { this.cal.destroy(); } catch(e) {}
        }
        container.innerHTML = '';

        const startOfYear = new Date();
        startOfYear.setMonth(0, 1);
        startOfYear.setHours(0, 0, 0, 0);

        if (typeof CalHeatMap === 'undefined') {
            console.error("CalHeatMap library not loaded!");
            container.innerHTML = '<div style="padding: 20px; color: #999;">Heatmap library not loaded</div>';
            return;
        }

        this.cal = new CalHeatMap();
        this.cal.init({
            itemSelector: "#cal-heatmap",
            domain: "month",
            subDomain: "day",
            data: this.reviewData,
            start: startOfYear,
            range: 12,
            cellSize: 10,
            cellPadding: 2,
            legend: [1, 10, 20, 40], // Start legend from 1 so 3 reviews are clearly visible
            displayLegend: false,
            tooltip: true,
            onClick: (date, value) => {
                this.showDetailsModal(date, value);
            }
        });

        this.setupTooltipObserver();
    }

    setupTooltipObserver() {
        const container = document.getElementById('cal-heatmap');
        if (!container) return;

        const observer = new MutationObserver(() => {
            const tooltip = container.querySelector('.ch-tooltip');
            if (tooltip && tooltip.style.display !== 'none') {
                const rect = tooltip.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const margin = 20;
                const sidebarWidth = 240; 

                // Default arrow shift is 50% (centered)
                tooltip.style.setProperty('--arrow-shift', '50%');

                // Collision with left (Sidebar side)
                if (rect.left < sidebarWidth) {
                    const currentLeft = parseFloat(tooltip.style.left);
                    const shift = sidebarWidth - rect.left;
                    tooltip.style.left = (currentLeft + shift) + 'px';
                    
                    // Adjust arrow to point back at the original center
                    const newCenter = rect.left + rect.width / 2;
                    const originalCenter = newCenter - shift;
                    const relativePos = ((originalCenter - (rect.left + shift)) / rect.width * 100) + 50;
                    tooltip.style.setProperty('--arrow-shift', `${Math.max(10, Math.min(90, relativePos))}%`);
                } 
                // Collision with right
                else if (rect.right > viewportWidth - margin) {
                    const currentLeft = parseFloat(tooltip.style.left);
                    const shift = rect.right - (viewportWidth - margin);
                    tooltip.style.left = (currentLeft - shift) + 'px';

                    // Adjust arrow to point back at the original center
                    const newCenter = rect.left + rect.width / 2;
                    const originalCenter = newCenter + shift;
                    const relativePos = ((originalCenter - (rect.left - shift)) / rect.width * 100) + 50;
                    tooltip.style.setProperty('--arrow-shift', `${Math.max(10, Math.min(90, relativePos))}%`);
                }
            }
        });

        observer.observe(container, { 
            attributes: true, 
            childList: true, 
            subtree: true,
            attributeFilter: ['style']
        });
    }

    updateUI() {
        document.getElementById('stat-daily-avg').textContent = this.stats.dailyAvg;
        document.getElementById('stat-days-learned').textContent = this.stats.daysLearned;
        document.getElementById('stat-longest-streak').textContent = this.stats.longestStreak;
        document.getElementById('stat-current-streak').textContent = this.stats.currentStreak;
    }

    async showDetailsModal(date, value) {
        const modal = document.getElementById('heatmapDetailsModal');
        const title = document.getElementById('heatmapDetailsTitle');
        const body = document.getElementById('heatmapDetailsBody');

        title.textContent = `Reviews on ${date.toLocaleDateString()}`;
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Loading details...</td></tr>';
        modal.classList.remove('hidden');

        if (!value) {
            body.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; padding: 40px 20px;">
                        <div style="color: #999; margin-bottom: 16px;">No activity on this day</div>
                        <button id="reviveBtn" class="btn-primary" style="padding: 8px 16px; font-size: 12px;">Revive this day</button>
                    </td>
                </tr>
            `;
            
            document.getElementById('reviveBtn').onclick = () => {
                this.reviveDay(date);
            };
            return;
        }

        const dayTs = Math.floor(date.getTime() / 1000);
        const dayRevs = this.rawReviews.filter(r => r.dateTs === dayTs);

        try {
            const cardIds = [...new Set(dayRevs.map(r => r.cardId))];
            const cardsInfo = await this.anki.invoke('cardsInfo', { cards: cardIds });
            
            const cardMap = {};
            cardsInfo.forEach(c => {
                const word = Object.values(c.fields)
                    .sort((a, b) => a.order - b.order)[0]?.value
                    .replace(/<[^>]*>/g, '');
                cardMap[c.cardId] = word;
            });

            body.innerHTML = dayRevs.map(r => {
                const result = r.ease > 1 ? 'Correct' : 'Again';
                const resultClass = r.ease > 1 ? 'status-correct' : 'status-again';
                return `
                    <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #f5f5f7; font-size: 11px; color: #666;">${r.cardId}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #f5f5f7; font-weight: 500;">${cardMap[r.cardId] || 'Deleted Card'}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #f5f5f7;">${r.ease}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #f5f5f7;"><span class="status-pill ${resultClass}">${result}</span></td>
                    </tr>
                `;
            }).join('');

        } catch (e) {
            body.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color:red">Error loading card info: ${e}</td></tr>`;
        }
    }

    // --- Streak Reviver Logic ---

    async ensureBackfillCard() {
        const deckName = "Lumina";
        try {
            // 1. Create deck if missing
            const decks = await this.anki.getDecks();
            if (!decks.includes(deckName)) {
                await this.anki.invoke('createDeck', { deck: deckName });
            }

            // 2. Find existing card in this deck
            const cards = await this.anki.invoke('findCards', { query: `deck:"${deckName}"` });
            if (cards && cards.length > 0) return cards[0];

            // 3. Create a dummy note if no cards exist
            console.log("Anki Heatmap: Creating dummy card for streak fixing...");
            const noteId = await this.anki.addNote({
                deckName: deckName,
                modelName: "Basic",
                fields: { Front: "Lumina", Back: "This card is used to maintain your heatmap streak. Please do not delete it." },
                options: { allowDuplicate: true },
                tags: ["lumina-streak-fixer"]
            });

            const newCards = await this.anki.invoke('findCards', { query: `nid:${noteId}` });
            const cardId = newCards[0];
            
            // Suspend the card so it never shows up in study
            await this.anki.invoke('suspend', { cards: [cardId] });
            
            return cardId;
        } catch (e) {
            console.error("Failed to ensure backfill card:", e);
            throw e;
        }
    }

    async reviveDay(date) {
        try {
            const btn = document.getElementById('reviveBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Reviving...';
            }

            const cardId = await this.ensureBackfillCard();
            
            // Generate 3 reviews for the day at 12:00 PM
            const baseTime = new Date(date);
            baseTime.setHours(12, 0, 0, 0);
            let ts = baseTime.getTime();

            // Ensure unique IDs by adding random offsets and checking against existing reviews
            const getUniqueTs = (base) => {
                let uniqueTs = base + Math.floor(Math.random() * 1000);
                // Simple collision avoidance
                while (this.rawReviews.some(r => r.id === uniqueTs)) {
                    uniqueTs += 1;
                }
                return uniqueTs;
            };

            // Format: [time (ID), cid, usn, ease, ivl, lastIvl, factor, timeTaken, type]
            const reviews = [
                [getUniqueTs(ts), cardId, -1, 3, 0, 0, 2500, 1000, 0],
                [getUniqueTs(ts + 2000), cardId, -1, 3, 0, 0, 2500, 1200, 0],
                [getUniqueTs(ts + 4000), cardId, -1, 3, 0, 0, 2500, 800, 0],
                [getUniqueTs(ts + 6000), cardId, -1, 3, 0, 0, 2500, 900, 0],
                [getUniqueTs(ts + 8000), cardId, -1, 3, 0, 0, 2500, 1100, 0]
            ];

            await this.anki.invoke('insertReviews', { reviews });
            
            // Give Anki a moment to process
            await new Promise(r => setTimeout(r, 500));
            
            // Refresh
            await this.refresh();
            
            // Hide modal
            document.getElementById('heatmapDetailsModal').classList.add('hidden');
            alert(`Streak revived for ${date.toLocaleDateString()}!`);

        } catch (e) {
            alert("Failed to revive streak: " + e);
        }
    }
}

// Global instance
window.ankiHeatmap = new AnkiHeatmap();
