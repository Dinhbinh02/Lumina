# 🚀 Lộ Trình Phát Triển Hệ Thống GenUI Widgets Cho Nexus (0đ API Cost)

> **Mục tiêu:** Xây dựng kho mini-widgets tương tác chất lượng cao ngay trong khung chat của Nexus, lấy cảm hứng từ OpenAI GenUI và Google Gemini, nhưng hoạt động **100% miễn phí** (kết hợp **Client-side JavaScript** và **Public Open APIs không cần API Key**).

---

## 🏗️ 1. Kiến Trúc Hệ Thống (Widget Runtime Architecture)

### 1.1 Cú pháp gọi Widget chuẩn trong LLM Prompt
AI sẽ gọi widget thông qua thẻ LMDX chuẩn:
```html
<Widget name="timer" minutes="25" label="Pomodoro Focus" />
<Widget name="currency" from="USD" to="VND" amount="100" />
<Widget name="weather" location="Hanoi" />
<Widget name="crypto" symbol="BTC" />
<Widget name="loan" amount="1000000000" rate="8.5" years="20" />
```

### 1.2 Luồng xử lý kỹ thuật (Data Flow)
1. **LMDX Parser (`lmdx_components_parser.js`)**: Nhận diện thẻ `<Widget name="..." .../>` khi stream tin nhắn.
2. **Widget Registry (`src/components/widgets/widget_registry.js`)**:
   - Đăng ký các module widget độc lập.
   - Nhận props từ thẻ XML, khởi tạo component với UI chuẩn thiết kế Nexus.
3. **Data Provider Layer**:
   - Với Widget Local: Chạy logic toán học / Web APIs trực tiếp trong browser.
   - Với Widget Realtime: Gọi `fetch()` qua Background Service Worker / Public APIs (CORS-free).

---

## 🎯 2. Danh Mục 36 Widgets Tinh Tuyển (Không Trùng Lặp)

Dưới đây là 36 Widgets được chọn lọc kỹ lưỡng, phân chia theo 5 Phase từ dễ đến nâng cao, đảm bảo mỗi widget đều giải quyết một nhu cầu thực tế và không bị trùng lặp chức năng:

---

### ⏱️ PHASE 1: Tiện Ích Hàng Ngày & Quản Lý Thời Gian (Essential Daily Utilities)
> *100% Local JavaScript — Không cần mạng, hoạt động tức thì, độ tin cậy tuyệt đối.*

| STT | Tên Widget (`name`) | Mục đích & Chức năng | Nguồn dữ liệu / Công nghệ | Câu lệnh mẫu (Prompt Trigger) |
| :---: | :--- | :--- | :--- | :--- |
| 1 | **`timer`** | Đếm ngược thời gian, có nút Start/Pause/Reset và chuông báo âm thanh. | `setInterval` + Web Audio API | *"hẹn giờ 10 phút", "đặt timer 3m"* |
| 2 | **`pomodoro`** | Đồng hồ Pomodoro chuẩn (25m học / 5m nghỉ) + lưu chu kỳ vào LocalStorage. | Web Audio API + LocalStorage | *"bật pomodoro", "tập trung 25p"* |
| 3 | **`stopwatch`** | Đồng hồ bấm giờ thể thao có chức năng ghi vòng (Lap timing). | `performance.now()` | *"bấm giờ", "stopwatch"* |
| 4 | **`unit_converter`** | Bộ đổi đơn vị toàn năng (Chiều dài, Cân nặng, Thể tích, Tốc độ, Nhiệt độ, Data). | Công thức chuẩn ISO | *"50 miles sang km", "100 lbs sang kg"* |
| 5 | **`world_clock`** | So sánh múi giờ giữa các thành phố lớn trên thế giới thời gian thực. | Browser `Intl.DateTimeFormat` | *"giờ New York và Tokyo", "múi giờ London"* |
| 6 | **`date_diff`** | Tính chính xác số ngày/tuần/tháng giữa 2 ngày hoặc đếm ngược đến sự kiện. | Browser `Date` API | *"còn bao nhiêu ngày đến Tết", "tính ngày từ A đến B"* |
| 7 | **`qr_generator`** | Tạo mã QR ngay lập tức cho đường link, mật khẩu Wifi hoặc văn bản. | Thuần Canvas / QRCode generator | *"tạo QR cho link...", "tạo mã QR wifi"* |

---

### 💰 PHASE 2: Tài Chính, Tiền Tệ & Thị Trường (Finance & Realtime Markets)
> *Kết hợp Public Open APIs 0đ và công thức tài chính chuẩn.*

| STT | Tên Widget (`name`) | Mục đích & Chức năng | Nguồn dữ liệu / Công nghệ | Trạng thái | Câu lệnh mẫu (Prompt Trigger) |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 8 | **`currency`** | Quy đổi tỷ giá ngoại tệ trực tiếp (USD, EUR, VND, JPY...) có ô nhập tiền realtime. | **Open ER / ECB API** *(100% Free, no key)* | ✅ **Hoàn thành** | *"100 USD sang VND", "tỷ giá EUR hôm nay"* |
| 9 | **`crypto`** | Bảng theo dõi giá Bitcoin, ETH, SOL... thời gian thực kèm % tăng giảm 24h & sparkline. | **Binance Public API** *(0đ, no key)* | ✅ **Hoàn thành** | *"giá btc hôm nay", "giá solana realtime"* |
| 10 | **`loan_calc`** | Tính toán trả góp vay mua nhà/xe, chia đều gốc lãi hàng tháng kèm thanh trượt. | Công thức tài chính Amortization | ✅ **Hoàn thành** | *"tính vay ngân hàng 1 tỷ lãi 8% trong 15 năm"* |
| 11 | **`compound_interest`** | Trực quan hóa sức mạnh lãi kép theo năm với biểu đồ tăng trưởng SVG Area Chart. | Pure Financial Math + SVG | ✅ **Hoàn thành** | *"tính lãi kép 50tr mỗi tháng gửi 5tr lãi 10%"* |
| 12 | **`tip_splitter`** | Tính tiền tip và tự động chia đều hóa đơn theo số người trong bàn. | Local Math | ✅ **Hoàn thành** | *"chia tiền bill 850k cho 4 người tip 10%"* |
| 13 | **`gold_price`** | Tra cứu biến động giá vàng thế giới (XAU/USD) và quy đổi lượng/chỉ realtime. | Binance PAXG Public Feed *(0đ)* | ✅ **Hoàn thành** | *"giá vàng thế giới hôm nay"* |

---

### 🌤️ PHASE 3: Thời Tiết, Môi Trường & Sức Khỏe (Weather & Lifestyle)
> *Dùng Open-Meteo API siêu tốc, hoàn toàn miễn phí, không giới hạn.*

| STT | Tên Widget (`name`) | Mục đích & Chức năng | Nguồn dữ liệu / Công nghệ | Trạng thái | Câu lệnh mẫu (Prompt Trigger) |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 14 | **`weather`** | Thẻ thời tiết hiện tại: Nhiệt độ, cảm giác thực tế, độ ẩm, gió, icon mưa/nắng. | **Open-Meteo API** *(0đ, no key)* | ✅ **Hoàn thành** | *"thời tiết Hà Nội", "weather in Da Nang"* |
| 15 | **`weather_forecast`** | Dự báo thời tiết chi tiết 7 ngày tới dạng biểu đồ nhiệt độ min/max. | **Open-Meteo API** *(0đ, no key)* | ✅ **Hoàn thành** | *"dự báo thời tiết tuần này ở Sài Gòn"* |
| 16 | **`air_quality`** | Chỉ số chất lượng không khí (AQI), nồng độ bụi mịn PM2.5, cảnh báo an toàn. | **Open-Meteo Air Quality** *(0đ)* | ✅ **Hoàn thành** | *"chỉ số không khí hôm nay", "AQI Hanoi"* |
| 17 | **`sun_uv`** | Chỉ số tia cực tím (UV Index) và giờ mặt trời mọc / hoàng hôn. | Open-Meteo + Celestial Arc | ✅ **Hoàn thành** | *"chỉ số UV hôm nay", "mấy giờ mặt trời lặn"* |
| 18 | **`bmi_tdee`** | Tính chỉ số BMI, mỡ cơ thể và lượng calo TDEE cần nạp để tăng/giảm cân. | Công thức Mifflin-St Jeor | ✅ **Hoàn thành** | *"tính BMI cao 1m75 nặng 72kg", "tính calo giảm cân"* |

---

### 💻 PHASE 4: Lập Trình Viên & Công Cụ Kỹ Thuật (Developer & Code Tools)
> *Các công cụ debug và chạy thử code trực tiếp cho kỹ sư phần mềm.*

| STT | Tên Widget (`name`) | Mục đích & Chức năng | Nguồn dữ liệu / Công nghệ | Câu lệnh mẫu (Prompt Trigger) |
| :---: | :--- | :--- | :--- | :--- |
| 20 | **`code_sandbox`** | Khung chạy thử HTML/CSS/JS độc lập (Live Sandbox) với nút Run và Reset. | Sandboxed iframe | *"chạy thử đoạn html này", "demo animation css"* |
| 21 | **`regex_tester`** | Thử nghiệm Regular Expression trực tiếp với highlight chuỗi match tức thì. | JS RegExp engine | *"test regex email", "kiểm tra regex số điện thoại"* |
| 22 | **`json_viewer`** | Định dạng, làm đẹp (beautify), lọc cú pháp và thu phóng cây JSON. | Local Tree Renderer | *"format json này giúp tôi", "kiểm tra json"* |
| 23 | **`diff_viewer`** | So sánh 2 đoạn văn bản hoặc code để tìm dòng khác biệt (Diff highlighting). | Diff algorithm | *"so sánh sự khác nhau giữa 2 đoạn code này"* |
| 24 | **`color_palette`** | Trích xuất bảng màu, mã HEX/RGB và kiểm tra độ tương phản WCAG accessibility. | Local Color Math | *"tạo bảng màu pastel", "kiểm tra contrast màu này"* |
| 25 | **`base64_tool`** | Mã hóa và giải mã Base64 / URL Encode / JWT Decoder. | Browser `atob`/`btoa` | *"decode chuỗi base64 này", "giải mã jwt"* |
| 26 | **`hash_generator`** | Tạo mã băm MD5, SHA-256, SHA-512 nhanh cho chuỗi ký tự. | Web Crypto API (`crypto.subtle`) | *"tạo hash sha256 cho chuỗi này"* |

---

### 📚 PHASE 5: Bản Đồ, Giáo Dục & Trực Quan Hóa (Maps, Education & Visuals)
> *Khai thác sức mạnh của OpenStreetMap và kho tri thức mở.*

| STT | Tên Widget (`name`) | Mục đích & Chức năng | Nguồn dữ liệu / Công nghệ | Trạng thái | Câu lệnh mẫu (Prompt Trigger) |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 28 | **`function_plotter`** | Trình vẽ đồ thị hàm số giải tích $y = f(x)$ với tọa độ hover và presets. | HTML5 Canvas 2D / SVG | ✅ **Hoàn thành** | *"vẽ đồ thị y = x^2 - 4x + 3", "đồ thị sin(x)"* |
| 29 | **`periodic_table`** | Bảng tuần hoàn hóa học tương tác 18 cột: Tra cứu số hiệu, cấu hình e, độ âm điện. | Local Chemistry Dataset | ✅ **Hoàn thành** | *"nguyên tố Vàng trong bảng tuần hoàn", "nguyên tử Fe"* |
| 31 | **`flashcard`** | Thẻ lật 2 mặt tương tác để học từ vựng tiếng Anh hoặc ôn bài thi. | CSS 3D Flip Card | *"tạo 5 flashcard học từ vựng IELTS chủ đề môi trường"* |
| 32 | **`quiz_card`** | Câu hỏi trắc nghiệm 4 lựa chọn có chấm điểm đúng/sai và giải thích ngay. | Local Interactive State | *"tạo bài trắc nghiệm nhanh về JavaScript"* |
| 33 | **`bracket_tree`** | Cây sơ đồ thi đấu loại trực tiếp (Tournament Bracket) 4/8/16 đội. | Dynamic SVG Tree | *"sơ đồ vòng bán kết Champions League"* |
| 34 | **`checklist`** | Danh sách công việc / chuẩn bị hành lý có ô tick chọn và thanh tiến độ %. | Local Check State | *"checklist chuẩn bị đi du lịch biển"* |
| 35 | **`youtube_player`** | Trình phát video YouTube nhúng chuẩn kích thước 16:9 trực tiếp trong chat. | YouTube IFrame Player API | *"video hướng dẫn git cơ bản", "bài hát Lạc Trôi"* |
| 36 | **`wikipedia_card`** | Thẻ tóm tắt thông tin bách khoa toàn thư kèm ảnh đại diện chính thức. | **Wikipedia REST API** *(0đ, no key)* | *"tiểu sử Albert Einstein", "lịch sử Internet"* |

---

## 🛠️ 3. Quy Trình Triển Khai Từng Bước (Implementation Plan)

### Bước 1: Khởi tạo Core Widget Engine (`src/components/widgets/`)
- Tạo file quản lý trung tâm `widget_manager.js` và `widget_registry.js`.
- Cập nhật `lmdx_components_parser.js` để parse thẻ `<Widget name="..." .../>` và mount component vào DOM sau khi render markdown.
- Cập nhật CSS hệ thống `src/pages/nexus/styles/components.css` cho container `.nexus-widget-card`.

### Bước 2: Triển khai theo từng giai đoạn
1. **Giai đoạn 1**: 7 Widgets Hàng ngày (`timer`, `pomodoro`, `stopwatch`, `unit_converter`, `world_clock`, `date_diff`, `qr_generator`).
2. **Giai đoạn 2**: 7 Widgets Tài chính & Tiền tệ (`currency`, `crypto`, `loan_calc`, `compound_interest`, `tax_calc`, `tip_splitter`, `gold_price`).
3. **Giai đoạn 3**: 5 Widgets Thời tiết & Sức khỏe (`weather`, `weather_forecast`, `air_quality`, `sun_uv`, `bmi_tdee`).
4. **Giai đoạn 4**: 7 Widgets Lập trình & Kỹ thuật (`code_sandbox`, `regex_tester`, `json_viewer`, `diff_viewer`, `color_palette`, `base64_tool`, `hash_generator`).
5. **Giai đoạn 5**: 10 Widgets Bản đồ, Giáo dục & Media (`map`, `country_info`, `function_plotter`, `periodic_table`, `flashcard`, `quiz_card`, `bracket_tree`, `checklist`, `youtube_player`, `wikipedia_card`).

### Bước 3: Cập nhật System Prompt AI
- Bổ sung tài liệu hướng dẫn `<Widget>` vào `chat_stream_service.js` để AI tự động kích hoạt đúng widget khi người dùng yêu cầu.
