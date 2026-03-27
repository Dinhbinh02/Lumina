const API_BASE = "https://ophim1.com";
const video = document.getElementById("video");
const episodesGrid = document.getElementById("episodes");
const loader = document.getElementById("loader");

let hls = null;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    
    // Xử lý tìm kiếm từ trang xem phim
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim() !== "") {
                const searchLink = `index.html?q=${encodeURIComponent(searchInput.value.trim())}`;
                window.location.assign(searchLink);
            }
        });
    }

    if (slug) {
        playMovie(slug);
    } else {
        window.location.href = "index.html";
    }
});

async function playMovie(slug) {
    showLoader(true);
    try {
        const res = await fetch(`${API_BASE}/v1/api/phim/${slug}`);
        const data = await res.json();
        const movie = data.data.item;
        
        document.title = `Đang xem: ${movie.name} - Lumina Movies`;
        document.getElementById("current-title").innerText = movie.name;
        document.getElementById("current-desc").innerText = movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : "";

        episodesGrid.innerHTML = "";
        let firstLink = "";
        
        if (data.data.item.episodes && data.data.item.episodes.length > 0) {
            const server = data.data.item.episodes[0];
            server.server_data.forEach((ep, index) => {
                if (index === 0) firstLink = ep.link_m3u8;
                
                const btn = document.createElement("button");
                btn.className = "episode-btn" + (index === 0 ? " active" : "");
                btn.innerText = ep.name;
                btn.onclick = () => {
                    document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    initPlayer(ep.link_m3u8);
                };
                episodesGrid.appendChild(btn);
            });
        }

        if (firstLink) {
            initPlayer(firstLink);
        }
    } catch (err) {
        console.error("Play Movie Error:", err);
        alert("Lỗi tải phim!");
    } finally {
        showLoader(false);
    }
}

function initPlayer(url) {
    if (hls) {
        hls.destroy();
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
    } else if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
    } else {
        video.src = url;
    }
    video.play().catch(e => console.log("Auto-play blocked"));
}

function showLoader(show) {
    if (loader) loader.className = show ? "loader active" : "loader";
}
