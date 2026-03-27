const API_BASE = "https://ophim1.com";
const IMG_BASE = "https://img.ophim1.com/uploads/movies/"; 
const movieGrid = document.getElementById("movieGrid");
const loader = document.getElementById("loader");
const listTitle = document.getElementById("list-title");
const searchInput = document.getElementById("searchInput");
const searchInfo = document.getElementById("searchInfo");

// Các phần tử lọc
const selectCategory = document.getElementById("selectCategory");
const selectCountry = document.getElementById("selectCountry");
const selectYear = document.getElementById("selectYear");

document.addEventListener('DOMContentLoaded', () => {
    // Tải dữ liệu ban đầu
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    
    // Tải danh sách bộ lọc
    initFilters();

    if (query) {
        searchInput.value = query;
        searchMovies(query);
    } else {
        loadHome();
    }
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchMovies(searchInput.value);
        }
    });

    // Xử lý sự kiện lọc
    selectCategory.addEventListener('change', () => filterMovies('the-loai', selectCategory));
    selectCountry.addEventListener('change', () => filterMovies('quoc-gia', selectCountry));
    selectYear.addEventListener('change', () => filterMovies('nam-phat-hanh', selectYear));
});

// Lây danh sách lọc (thể loại, quốc gia, năm)
async function initFilters() {
    try {
        const [cats, counts, years] = await Promise.all([
            fetch(`${API_BASE}/v1/api/the-loai`).then(r => r.json()),
            fetch(`${API_BASE}/v1/api/quoc-gia`).then(r => r.json()),
            fetch(`${API_BASE}/v1/api/nam-phat-hanh`).then(r => r.json())
        ]);

        // Đổ dữ liệu vào các select
        cats.data.items.forEach(c => selectCategory.add(new Option(c.name, c.slug)));
        counts.data.items.forEach(c => selectCountry.add(new Option(c.name, c.slug)));
        years.data.items.forEach(y => selectYear.add(new Option(y.name, y.name)));
    } catch (e) {
        console.error("Filter Init Error:", e);
    }
}

// Thực hiện lọc phim
async function filterMovies(type, selectElement) {
    const slug = selectElement.value;
    if (!slug) {
        loadHome();
        return;
    }
    
    // Reset các bộ lọc còn lại để tránh nhầm lẫn
    if (selectElement !== selectCategory) selectCategory.value = "";
    if (selectElement !== selectCountry) selectCountry.value = "";
    if (selectElement !== selectYear) selectYear.value = "";

    showLoader(true);
    searchInfo.classList.remove('active');
    
    try {
        const res = await fetch(`${API_BASE}/v1/api/${type}/${slug}`);
        const data = await res.json();
        const items = data.data.items || [];
        const name = selectElement.options[selectElement.selectedIndex].text;
        renderMovies(items, `Danh sách phim: ${name}`);
    } catch (err) {
        console.error("Filter API Error:", err);
    } finally {
        showLoader(false);
    }
}

async function loadHome() {
    showLoader(true);
    searchInfo.classList.remove('active');
    try {
        const res = await fetch(`${API_BASE}/v1/api/home`);
        const data = await res.json();
        renderMovies(data.data.items || [], "Phim Mới Cập Nhật");
    } catch (err) {
        console.error("Home API Error:", err);
    } finally {
        showLoader(false);
    }
}

async function searchMovies(keyword) {
    if (!keyword || keyword.trim() === "") {
        loadHome();
        return;
    }
    showLoader(true);
    try {
        const res = await fetch(`${API_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword.trim())}`);
        const data = await res.json();
        const items = (data.data && data.data.items) ? data.data.items : (data.items || []);
        
        // Hiển thị thông tin kết quả tìm kiếm
        searchInfo.querySelector('span:nth-child(1)').innerText = items.length;
        searchInfo.querySelector('#searchKey').innerText = keyword;
        searchInfo.classList.add('active');
        
        renderMovies(items, "Kết quả tìm kiếm");
    } catch (err) {
        console.error("Search API Error:", err);
    } finally {
        showLoader(false);
    }
}

// Ảnh mặc định (Base64 SVG) để dùng khi không tải được ảnh từ server
const DEFAULT_POSTER = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg' width%3D'200' height%3D'300' viewBox%3D'0 0 200 300'%3E%3Crect width%3D'200' height%3D'300' fill%3D'%23252830'%2F%3E%3Ctext x%3D'50%25' y%3D'50%25' dominant-baseline%3D'middle' text-anchor%3D'middle' font-family%3D'sans-serif' font-size%3D'14' fill%3D'%23555'%3EImage Error%3C%2Ftext%3E%3C%2Fsvg%3E";

function renderMovies(items, title) {
    listTitle.innerText = title;
    movieGrid.innerHTML = "";
    
    if (!items || items.length === 0) {
        movieGrid.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: var(--text-dim)'>Không tìm thấy phim nào phù hợp.</p>";
        return;
    }

    items.forEach(movie => {
        let poster = "";
        if (movie.poster_url) {
            poster = movie.poster_url.startsWith('http') ? movie.poster_url : `${IMG_BASE}${movie.poster_url}`;
        } else if (movie.thumb_url) {
            poster = movie.thumb_url.startsWith('http') ? movie.thumb_url : `${IMG_BASE}${movie.thumb_url}`;
        } else {
            poster = DEFAULT_POSTER;
        }

        const card = document.createElement("div");
        card.className = "movie-card";
        card.innerHTML = `
            <img class="poster" src="${poster}" alt="${movie.name}" loading="lazy" 
                 onerror="this.onerror=null;this.src='${DEFAULT_POSTER}'">
            <span class="badge">${movie.year || ''}</span>
            <div class="details">
                <div class="title">${movie.name}</div>
                <div class="meta">${movie.origin_name || ''}</div>
            </div>
        `;
        // Chuyển hướng sang trang player kèm theo slug
        card.onclick = () => {
            const watchUrl = `player.html?slug=${movie.slug}`;
            window.location.assign(watchUrl);
        };
        movieGrid.appendChild(card);
    });
}


function showLoader(show) {
    loader.className = show ? "loader active" : "loader";
}
