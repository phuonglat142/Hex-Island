# Hex Island Android — Kế hoạch port sang Kotlin + Jetpack Compose (native)

> Tài liệu kế hoạch cho bản Android native. Project Android nằm ở repo riêng; repo này (bản web) chỉ là mẫu tham chiếu. Đường dẫn `src/...` trong tài liệu là của repo web này.

## 1. Bối cảnh

Bản web (`Hex-Island`, ~17.000 dòng TypeScript: Vite + Preact + three.js + PeerJS) là **mẫu tham chiếu về luật chơi và hành vi**. Bản Android viết lại hoàn toàn bằng Kotlin + Jetpack Compose, không WebView, không dùng lại code TS, kiến trúc theo Clean Architecture chuẩn Android.

Quyết định đã chốt:

| Hạng mục | Quyết định |
|---|---|
| Bàn cờ | **2D Compose Canvas** (tham chiếu `src/board/BoardView.ts`, bỏ toàn bộ 3D three.js) |
| Chơi mạng | **Offline** (bot, chuyền máy) + **online chung Wi‑Fi (LAN)**; không PeerJS/WebRTC, không chơi chung với bản web |
| Vị trí | Plan nằm trong repo này (`docs/android-plan.md`); project Android ở **repo riêng** |
| Tên app | Đặt là **Hex Island**; không dùng chữ "Catan" trong tên app, applicationId, mô tả store (thương hiệu của bên thứ ba). Giữ dòng ghi công bản gốc theo `NOTICE.md` (MIT, Sowtank) trong màn Trợ giúp |
| Cấu trúc project | Theo repo mẫu `dan-tech-academy/kotlin-accelerator-ai` (module phẳng, `build-logic/convention`), bản **Android-only**. Không KMP ở đợt này; `:engine`, `:domain`, `:dre-core` giữ Kotlin thuần để sau chuyển KMP được |
| DI + state | **Koin** + **DRE-KT** (reducer thuần, vendored `:dre-core` + `:dre-viewmodel`) như repo mẫu |
| Biển cả (Seafarers) | Nằm trong phạm vi port. Engine, bot, fixtures port **cùng lúc** với bản Cơ bản (bước 2); giao diện Biển cả là **mốc riêng** (bước 7) sau khi ván cổ điển chơi được |
| Hướng màn hình | **Điện thoại khoá dọc, màn lớn tự do.** `android:screenOrientation="portrait"` cho `MainActivity`; Android 16+ tự bỏ qua giới hạn này trên màn ≥ 600dp nên tablet/máy gập vẫn xoay được. Chỉ cần 2 bố cục: dọc điện thoại và màn lớn; không làm bố cục ngang cho điện thoại (cao ~360dp, quá chật cho bàn cờ + tay bài). Bàn cờ lục giác gần vuông nên cầm dọc cho bàn cờ to tương đương cầm ngang mà còn dư khoảng 45% màn cho UI, chơi được một tay, chuyền máy dễ |
| Quy trình | Bộ kit AI `kta-*` của repo mẫu (cài bằng `kta-install.sh`): `kta-break-down` → `kta-impl` → `kta-unit-test` / `kta-ui-test` → `kta-fix` |

Không port: bàn cờ 3D và mức chất lượng đồ hoạ (`src/board/*` trừ `BoardView.ts`), Web Worker, PeerJS/TURN, trailer/showcase, script Blender.

## 2. Stack công nghệ

Phiên bản đối chiếu ngày **2026‑11‑12**. Kết quả tra cứu có vài nguồn lệch nhau, nên **bước 0 bắt buộc kiểm tra lại** trên Google Maven / Maven Central trước khi ghim vào `libs.versions.toml`.

| Nhóm | Lựa chọn | Phiên bản (11/2026) | Ghi chú |
|---|---|---|---|
| Ngôn ngữ | Kotlin (K2) | 2.4.0 | kiểm tra bản vá 2.4.x |
| Build | AGP / Gradle / JDK | 9.5.1 / 9.6.0 / 17+ | AGP 9 có Kotlin tích hợp sẵn; dùng Kotlin DSL + version catalog + convention plugin |
| SDK | compileSdk = targetSdk / minSdk | 37 (Android 17) / 26 | Play đang yêu cầu target 36, sẽ yêu cầu 37 vào 08/2027 |
| UI | Compose BOM | 2026.09.00 (Compose 1.12.x) | Material 3, compose compiler plugin đi theo Kotlin |
| Điều hướng | Navigation Compose (`androidx.navigation:navigation-compose`) | bản stable mới nhất (mẫu: 2.9.2) | route `@Serializable`; mỗi feature đăng ký qua `FeatureNavigationRegistry` như repo mẫu |
| DI | Koin (`koin-android`, `koin-androidx-compose`) | bản stable mới nhất (mẫu: 4.1.1) | không cần annotation processor; `AppGraphTest` dựng mọi binding để bắt thiếu sót |
| State | DRE-KT (`dev.drekt`: `DreStore`, `Reducer`, `ReduceResult`, `DreStoreViewModel`) | copy nguồn từ repo mẫu | copy thẳng nguồn `dre-core` + `dre-viewmodel` (và bộ kit `ai/`) về dùng; giữ nguyên header/ghi công nếu có |
| Bất đồng bộ | kotlinx.coroutines + Flow | 1.11.0 | |
| JSON | kotlinx.serialization | 1.11.0 | lưu ván, cấu hình, giao thức LAN |
| Lưu trữ | DataStore | 1.2.1 | cài đặt, cấu hình gần nhất, vương quốc, bản đồ tự tạo. Không cần Room |
| Lifecycle | lifecycle-runtime-compose, lifecycle-viewmodel-compose | bản stable mới nhất | `collectAsStateWithLifecycle` |
| Bộ sưu tập | kotlinx-collections-immutable | bản mới nhất | `ImmutableList` trong UiState để Compose skip được |
| LAN | Ktor (server‑cio + client‑cio + websockets) | 3.5.2 (kiểm tra 3.6.x) | host chạy WebSocket server ngay trên máy |
| Tìm phòng | `NsdManager` (mDNS, API hệ thống) | — | không cần thư viện |
| Âm thanh | `AudioTrack` (tự tổng hợp PCM) | — | thay WebAudio synth của `src/ui/sfx.ts`, không cần file âm thanh |
| Test | kotlin‑test, coroutines‑test, Turbine, Compose UI test | bản mới nhất | |
| Test (mock) | MockK | bản mới nhất | như repo mẫu |
| Chất lượng | detekt (+ compose rules) + ktlint, Android Lint, JaCoCo, Baseline Profile, R8 full mode | bản mới nhất | detekt và JaCoCo gắn qua convention plugin |

Nguyên tắc thêm thư viện: chỉ thêm khi API nền tảng không làm được; mỗi lần thêm phải tra bản stable mới nhất và ghi vào version catalog (không viết cứng version trong `build.gradle.kts`).

## 3. Kiến trúc

### 3.1 Module (Clean Architecture, phụ thuộc một chiều)

Tên và bố cục module theo repo mẫu `dan-tech-academy/kotlin-accelerator-ai` (bản Android-only, xem `tests/fixtures/android` của repo đó). Mọi module dùng `src/main`; không có `commonMain`, `:shared-app`, `iosApp`.

```
app/                     Application (startKoin), MainActivity, AppShell + NavHost,
                         AppFeatures.kt (danh sách feature tường minh), LanHostService
kernel/                  HexDispatchers (inject; không gọi Dispatchers.IO tại chỗ dùng)
dre-core/                DreStore, Reducer, ReduceResult, SideEffectHandler (Kotlin thuần)
dre-viewmodel/           DreStoreViewModel
engine/                  luật chơi, sinh bản đồ, bot, RNG (Kotlin/JVM thuần, không Android)
                         -- module thêm so với mẫu
domain/                  Kotlin thuần: game/ (GameSession), model/, repository/,
                         service/ (audio, haptic, lan), usecase/, error/ (DomainResult, DomainFailure)
data/                    di/, local/ (DataStore, GameSaveStore),
                         repo/ (settings, lobby, kingdom, custommap, audio/AudioTrackSfxManager, haptic/),
                         service/lan/ (Ktor host/client, NSD, WireMessage, Redactor, VoteManager),
                         session/ (LocalGameSession, HostGameSession, GuestGameSession, BotDriver)
core/                    navigation/ (Routes, FeatureNavigationRegistry),
                         di/ (FeatureModuleInitializer, FeatureRegistry),
                         platform/ (contract cần Activity/Context), util/
theme/                   token Hx* (primitive -> semantic -> component), HexIslandTheme, font
ui-components/           composable Hx* dùng chung: BoardCanvas, FlagImage, ResourceCard,
                         RichLogText, HxButton/HxChip/HxModal/HxPixelIcon
feature/menu | lobby | game | editor | online | help | settings
build-logic/convention/  hexisland.android.library | .android.feature | .android.compose |
                         .jvm.library | .detekt | .jacoco
config/detekt/  docs/journals/  plans/  CLAUDE.md  AGENTS.md
.claude/                 bộ kit kta-* do kta-install.sh sinh ra, không sửa tay
```

Bố cục package trong mỗi feature (theo `feature/game` của mẫu):

```
feature/<name>/src/main/kotlin/<package>/feature/<name>/
  di/           XxxFeatureModule (Koin, implement FeatureModuleInitializer)
  navigation/   XxxNavigation (implement FeatureNavigationProvider)
  screen/       XxxRoute, XxxScreen, XxxUiState, XxxScreenMapper, preview
  viewmodel/    XxxViewModel
  dialog/       XxxDialog (sealed), XxxDialogHost, content/
  domain/manage/handler/   side-effect handler của feature
```

Luật phụ thuộc: `feature -> domain, core, theme, ui-components, dre-viewmodel`; `data -> domain, kernel`; `domain -> engine`; `engine` không phụ thuộc gì ngoài kotlinx.serialization; `app` phụ thuộc tất cả và là nơi duy nhất ghép DI. ViewModel gọi use case, không gọi repository. Ranh giới được Gradle ép buộc (thay cho `scripts/check-imports.ts` của web). Không tạo `:secrets` (app không có khoá API) và `:feature:paywall`.

### 3.2 Engine (`:engine`) — port từ `src/engine/`

- API công khai thuần hàm: `GameEngine.createGame(config): GameState`, `GameEngine.applyAction(state, action): ApplyResult` (trả `state` mới + `List<Fx>` hoặc lỗi), cùng các truy vấn `viewFor`, `pendingActors`, `legalRoads/Settlements/Cities`, `legalRobberTiles`, `stealTargets`, `playableDev`, `tradeRatio`, `victoryPoints`; `Bot.act(state, pid)`, `Bot.hint(state, pid)`.
- `GameState` công khai là **data class bất biến** `@Serializable`. Bên trong engine làm việc trên bản sao khả biến (`MutableGame`) để port 1:1 từng handler của `game.ts`, xong đóng băng lại. Hình học bàn cờ (`vertices/edges/sea/ports/bounds`) tách thành `BoardGeometry` bất biến, dùng chung không copy; chỉ `tiles`, `robber` thay đổi.
- `Action`, `Fx`, `Phase`... là `sealed interface`/`enum` (thay union type của `types.ts`).
- **Văn bản tách khỏi engine:** web ghi log/lỗi bằng chuỗi tiếng Việt (`"@3 tung ra 8"`). Android: engine phát `LogEntry(turn, pid, LogMsg)` và `GameError` dạng sealed class; UI đổi sang chữ qua `strings.xml` (mặc định tiếng Việt, thêm `values-en` sau). Tên thẻ, tên sự kiện, tên chế độ cũng chuyển vào resource.
- **Bẫy khi port từ JS (ảnh hưởng tính tất định):**
  - `rng.ts` (mulberry32): dùng `Int` tràn số, `ushr`, nhân `Int` thay `Math.imul`; `rand = (t.toUInt().toDouble()) / 4294967296.0`.
  - `Math.round` của JS = `Math.round` của Java (`roundToInt`), **không** phải `kotlin.math.round` (làm tròn về số chẵn).
  - JS duyệt key số của object theo thứ tự tăng dần (`for k in s.buildings`, `Object.entries(responses)`): dùng `TreeMap`/`sortedMap` hoặc duyệt key đã sắp xếp ở mọi chỗ thứ tự có ảnh hưởng kết quả.
  - `Set`/`Map` của JS giữ thứ tự chèn: dùng `LinkedHashSet`/`LinkedHashMap`.
  - `noise()` của bot phụ thuộc `s.actions` và `rng.s`: giữ nguyên công thức 32‑bit.
- **Biển cả (Seafarers)** chọn bằng `Config.rules.expansion = 'seafarers'` (thiếu = bản Cơ bản, xem `expansionOf` trong `config.ts`):
  - Mọi trường Biển cả là **nullable, mặc định `null`**: `GameState.ships` (cạnh → `{owner, built}`), `shipMoved`, `goldPending`, `islandBonus`; `Board.pirate/pirateFrom/homeIslands`; `Tile.island`; `Vertex.sea`, `Edge.sea`, `SeaTile.id/verts`; `Player.shipsLeft`; `Rules.expansion/islandBonus/maxShips`. Dùng `Json { encodeDefaults = false; explicitNulls = false }` để ván Cơ bản serialize y hệt web (ván lưu cũ, fixtures cũ, giao thức LAN không đổi).
  - Bàn cờ biển: vành biển rộng 2 ô và chơi được. **Id đỉnh/cạnh đất đánh trước, biển đánh sau**, vòng biển thứ hai không tiêu RNG, nên phần đất giống hệt bản Cơ bản. `Vertex.hexes` vẫn chỉ gồm ô đất.
  - Truy vấn thêm: `isShipEdge`, `canBuildShip`, `legalShips`, `legalSetupShips`, `movableShips`, `shipDestinations`, `legalPirateTiles`, `pirateVictims`, `pirateTargets`, `canFreePiece`, `islandBonusVP`, `vpTargetFor`, `seaMapSize`.
  - `createGame` ở Biển cả **tắt cưỡng bức** các chế độ thông tin ẩn (úp bàn cờ, sương mù, nhà bí mật, số bí mật).

### 3.3 Domain + trình bày

- `GameSession` (interface trong domain) thay cho đối tượng `App` của web (`src/app/index.ts`):
  `val state: StateFlow<GameState?>`, `val effects: Flow<List<Fx>>`, `val mySeat`, `suspend fun dispatch(action): Result<Unit>`, `fun leave()`.
  Ba hiện thực: `LocalGameSession` (engine + bot + tự lưu), `HostGameSession` (Local + phát trạng thái cho khách), `GuestGameSession` (gửi action, nhận state đã lọc).
- Use case mỏng: `StartGame`, `ResumeGame`, `DispatchAction`, `GetHint`, `Rematch`, `Observe/SaveLobbyConfig`, `Save/Load/DeleteCustomMap`, `Encode/DecodeMapCode`, `Get/SaveKingdom`, `HostRoom`, `DiscoverRooms`, `JoinRoom`, `CastVote`.
- Mỗi màn hình theo **DRE-KT**: `XxxViewModel : DreStoreViewModel<UiState, Intent, SideEffect, AsyncOp>`. Reducer thuần (không I/O, test được bằng JVM) trả `ReduceResult(state, effects, asyncOps)`; mọi I/O là `AsyncOp` gọi use case; hiệu ứng một lần (toast, bay thẻ, âm thanh, điều hướng) là `SideEffect` do các handler trong `domain/manage/handler/` xử lý. Màn hình chia `XxxRoute` (lấy ViewModel qua Koin) và `XxxScreen` (stateless, preview được).
- `GameViewModel`: reducer chỉ quản state UI (chế độ chọn `pick`, `moveFrom` khi dời tàu, modal đang mở, ghế đang xem); `GameAsyncOp.Dispatch(action)` gọi `DispatchActionUseCase` → `GameSession`. Engine **không** bọc trong Dre reducer vì nó sống trong `GameSession` (còn host/khách). Handler: `Sfx`, `Haptic`, `FxAnimation`, `Toast`, `Navigation`.
- DI: mỗi feature một Koin module (`XxxFeatureModule`), liệt kê tường minh trong `app/AppFeatures.kt`; use case đăng ký ở `:app`, không ở `:domain`.
- `GameScreenMapper` (thuần, chạy trên `HexDispatchers.default`) thay `src/ui/game/signals.ts`: từ `GameState` + ghế đang xem tính `viewFor` **một lần**, rồi suy ra `seat`, `locked` (màn chuyền máy), `interaction` (loại + tập ô hợp lệ), `banner`, `offer`, tay bài, nút bật/tắt.
- `BotDriver` thay `App.scheduleBots`: `state.collectLatest { delay(tốc độ × hệ số + 2200ms nếu fx "kịch tính") → Bot.act → dispatch }`; lỗi bot thì tự `endTurn`/`passBuild` để không kẹt bàn.

### 3.4 Bàn cờ 2D (`:ui-components`, `BoardCanvas`)

- Một `Canvas` duy nhất, toạ độ bàn cờ → màn hình qua ma trận pan/zoom (`detectTransformGestures`, giới hạn zoom 0.6–4 như web).
- Vẽ theo lớp: biển + ô đất + token số + cảng (cache bằng `drawWithCache`, chỉ dựng lại khi `tiles` đổi) → vùng chọn kẻ trộm → đường → nhà/thành phố (kể cả "bóng ma" của Nhà bí mật) → kẻ trộm → sương mù → điểm gợi ý nước đi.
- Sương mù: lớp offscreen (`CompositingStrategy.Offscreen`) tô tối rồi đục lỗ bằng `BlendMode.DstOut` theo `vision.circles/caps`; làm mềm mép bằng `RenderEffect` blur (API 31+), máy cũ dùng gradient.
- Chạm: không tạo composable cho từng điểm; một `pointerInput` đổi toạ độ chạm về toạ độ bàn cờ rồi tìm đỉnh/cạnh/ô hợp lệ gần nhất trong bán kính chạm (≥ 48dp quy đổi).
- Hoạt ảnh bằng `Animatable`: công trình mới bật lên, lật ô (trễ theo khoảng cách tới tâm), ô vừa ra số nhấp nháy, kẻ trộm trượt. Đọc state trong pha draw (lambda `graphicsLayer {}`/`drawBehind`) để không recompose.
- Dùng lại `BoardCanvas` ở chế độ không tương tác cho preview trong Lobby và thumbnail bản đồ.
- Biển cả (làm ở bước 7): thêm lớp tàu và hải tặc, hit-test cạnh biển và ô biển; thiết kế lớp vẽ và hit-test ngay từ bước 4 sao cho thêm được loại quân mới mà không sửa cấu trúc.
- Icon tài nguyên: dùng PNG gốc ở `public/assets/icons/*_32.png` (tài sản của chính dự án, MIT), vẽ với `FilterQuality.None` để giữ nét pixel.

### 3.5 Online LAN (`:data` `service/lan/`, interface ở `:domain` `service/lan/`)

- **Host:** Ktor server CIO nhúng, `webSocket("/room")`, cổng động; đăng ký dịch vụ NSD `_hexisland._tcp` (tên = mã phòng 5 ký tự, TXT: tên chủ phòng, sức chứa, số người, phiên bản giao thức). Chạy trong foreground service loại `connectedDevice` để ván không chết khi chủ phòng rời app tạm thời.
- **Khách:** `NsdManager.discoverServices` → danh sách phòng trong mạng → `resolve` → `ws://ip:port/room` bằng Ktor client CIO. Dự phòng: nhập tay `ip:port` (hiện trên máy chủ phòng) khi router chặn mDNS.
- **Giao thức:** port từ `src/net/messages.ts` thành sealed class `@Serializable`: khách gửi `hello/pong/action/mark/vote/bye`, host gửi `welcome/lobby/refused/kicked/closed/error/init/state/meta/mark/ping`. Thông điệp giải mã lỗi thì bỏ qua (thay các hàm guard viết tay). Danh sách action hợp lệ gồm cả `placeShip`, `moveShip`, `chooseGold` của Biển cả; `redactFor` không cần đổi cho Biển cả.
- **Mô hình giữ nguyên như web:** host là nguồn sự thật, chạy engine + bot; mỗi khách nhận bản đã lọc bằng `redactFor(state, seat)` (ẩn RNG, thứ tự bộ thẻ, bài người khác, nhà bí mật, ô úp/sương mù) + `toWire` (hình học gửi 1 lần trong `init`, `tiles` chỉ gửi khi đổi). Host từ chối action sai ghế và action quản trị (`retirePlayer`, `setController`).
- **Độ bền:** token thiết bị cố định (DataStore) để về đúng ghế; heartbeat 3s / coi là chết sau 10s; khách tự kết nối lại; rớt quá 12s thì cả bàn **bỏ phiếu** chờ / bot thay / cho rời (`host.ts: startVote/checkVote/finishVote`); host tự lưu phiên để **mở lại phòng** cùng mã.
- **Quyền (target 37):** `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE`, `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `POST_NOTIFICATIONS`, và quyền runtime mới **`ACCESS_LOCAL_NETWORK`** (nhóm NEARBY_DEVICES, bắt buộc từ Android 17 cho cả NSD lẫn socket LAN). Xin quyền đúng lúc người dùng bấm "Chơi chung Wi‑Fi", có màn giải thích; đọc lại tài liệu "Local network permission" khi làm vì đây là API mới.
- Kiểm tra đang ở Wi‑Fi (`ConnectivityManager`) và báo rõ "hai máy phải chung một mạng Wi‑Fi" (hotspot của một máy cũng được).

## 4. Bảng ánh xạ web → Android

| Web | Android |
|---|---|
| `src/engine/types.ts`, `constants.ts`, `config.ts` | `:engine` `model/` (data class, sealed, enum), `Rules.kt`, `Presets.kt` |
| `src/engine/rng.ts`, `board.ts` | `Rng.kt`, `BoardGenerator.kt`, `Shapes.kt` |
| `src/engine/game.ts` | `GameEngine.kt` + `handlers/` (Setup, Roll, Robber, Build, Dev, Trade, Turn, Seat), `Vision.kt` |
| `src/engine/bot.ts` | `Bot.kt` |
| `src/app/index.ts`, `store.ts`, `events.ts` | `GameSession`, `LocalGameSession`, `BotDriver` |
| `src/app/persist.ts` | `GameSaveStore` (ghi debounce 1.5s, flush khi `ON_STOP`, xoá khi hết ván) |
| `src/net/*` | `:data` `service/lan/` (`LanHost`, `LanClient`, `WireMessage`, `Redactor`, `VoteManager`, `RoomDiscovery`) |
| `src/board/BoardView.ts` (kể cả tàu, hải tặc) | `BoardCanvas` trong `:ui-components` |
| `src/ui/game/signals.ts`, `controller.ts`, `actions.ts` | `GameViewModel` (DRE-KT), `GameScreenMapper`, `GameIntent` |
| `src/ui/game/*.tsx` (TopBar, Players, ActionBar, Modals, Log, Floating, fx) | composable trong `:feature:game` |
| `src/ui/screens/Menu, Lobby, Online, Editor, Help` | `:feature:menu, lobby, online, editor, help` |
| `src/ui/flag/*` | `FlagImage`, `FlagEditorScreen` |
| `src/ui/sfx.ts` | `AudioManager` (`:domain` `service/audio/`) + `AudioTrackSfxManager` (`:data` `repo/audio/`) |
| `src/styles/*.css` | `:theme` (token `Hx*`) |
| `tests/rules.test.ts`, `scripts/sim.ts`, `determinism.ts`, `tests/redact.test.ts`, `net.test.ts` | test JVM của `:engine` và `:data` |
| `tests/seafarers.test.ts`, `seafarers-maps.test.ts`, `sea-sim.test.ts`, `scripts/sim.ts --sea` (`runSeaSim`) | test JVM của `:engine` |

## 5. Các bước thực hiện

### Bước 0 — Chuẩn bị
1. Cài Android Studio stable mới nhất (kèm JDK), SDK Platform 37, một máy ảo API 37 và một máy thật.
2. Tạo repo Android riêng (ví dụ `HexIsland-Android`), `.gitignore` chuẩn Android.
3. Kiểm tra lại toàn bộ phiên bản ở mục 2 trên Google Maven / Maven Central / trang release notes chính thức và ghi vào `gradle/libs.versions.toml`.
4. Cài bộ kit vào repo Android (chạy từ thư mục gốc repo đó, cần quyền đọc repo mẫu): `gh api repos/dan-tech-academy/kotlin-accelerator-ai/contents/kta-install.sh -H "Accept: application/vnd.github.raw" | bash`. Kit sinh ra `.claude/skills`, `.claude/agents`, `.claude/kta` (không sửa tay). Viết `CLAUDE.md` + `AGENTS.md` cho repo Android dựa trên bản của repo mẫu (bỏ phần KMP/iOS, Supabase, Firebase).
5. Kit viết cho KMP trước: chạy `python3 .claude/kta/scripts/kta_profile.py --root . --ensure --summary` sau bước 1 và xác nhận nó nhận đúng project Android-only. Không dùng `kta-migrate` và các tài liệu `ios/`, `money/`.
6. Chạy `kta-break-down` trên tài liệu này để sinh `plans/<slug>/impl/phases/NN-*.md` (mỗi phase có `gate`). Từ bước 1 trở đi mỗi phase chạy bằng `kta-impl`, test bằng `kta-unit-test` / `kta-ui-test`, gate đỏ thì `kta-fix`; bố cục màn hình dùng `kta-layout`, icon app dùng `kta-logo-setup`.

### Bước 1 — Dựng khung project
1. Tạo cấu trúc module ở mục 3.1 và `build-logic/convention` với các plugin: `hexisland.android.library`, `.android.feature`, `.android.compose`, `.jvm.library`, `.detekt`, `.jacoco` (tham khảo `build-logic/` và `tests/fixtures/android/` của repo mẫu).
2. Cấu hình chung: `compileSdk/targetSdk 37`, `minSdk 26`, Java/Kotlin toolchain 17, `explicitApi()` cho `:engine`, `:domain`, `:dre-core`, bật R8 full mode cho release.
3. `:app`: `Application` gọi `startKoin` với các module lấy từ `AppFeatures.kt`; `MainActivity` (`enableEdgeToEdge()`, predictive back, `screenOrientation="portrait"`); `AppShell` + `NavHost` với các route `@Serializable` trong `:core` `navigation/Routes.kt`: `Menu, Lobby(online), Game, Editor, Online, Help, Settings`; `AppGraphTest` + `AppFeaturesTest`.
4. `:kernel` (`HexDispatchers`), `:dre-core`, `:dre-viewmodel` (copy từ repo mẫu), `:core` (`FeatureModuleInitializer`, `FeatureRegistry`, `FeatureNavigationRegistry`).
5. `:theme` + `:ui-components`: `HexIslandTheme` (bảng màu Sweetie‑16 lấy từ `src/styles/pixel.css`), font Be Vietnam Pro + Baloo 2 (OFL) đặt trong `res/font`, component nền (`HxButton`, `HxChip`, `HxModal`, `HxPixelIcon`).
6. CI GitHub Actions: `detekt`, `lint`, `test`, `assembleDebug`.
7. Kết quả: app chạy lên màn Menu trống, điều hướng được giữa các màn giả.

### Bước 2 — Port engine, gồm cả Biển cả (phần quan trọng nhất, làm trước UI)
1. Model: `Res, TileKind, DevType, Tile, Vertex, Edge, Port, Board/BoardGeometry, Config, Rules, Modes, Player, GameState, Action, Fx, Phase, ApplyResult` từ `types.ts`; hằng số từ `constants.ts` (`COSTS`, `DEV_DECKS`, `EVENTS`, `pips`), `defaultConfig`, `MODES`, `PRESETS`, `expansionOf` từ `config.ts`. Phần Biển cả: `BuildKind.ship`, `COSTS.ship` (gỗ + cừu), `Phase.gold`, `ShapeId.seaIslands/mainland`, `Expansion`, `Rules.expansion/islandBonus/maxShips` (thiếu = 15), `Player.shipsLeft`, `GameState.ships/shipMoved/goldPending/islandBonus`, action `placeShip`, `moveShip {from, to}`, `chooseGold {res}`, `moveRobber.target` (`robber` | `pirate`), Fx `pirate`, `shipMoved`.
2. `Rng` (mulberry32), `shuffle`, `pick`.
3. `BoardGenerator`: 12 hình dạng (`classic, mini, extended, big, huge, ring, star, kingdoms, islands, pangea` và hai bản đồ biển `seaIslands, mainland` với `seaMapSize`) + `custom`; ở Biển cả thêm vành biển 2 ô, đánh chỉ số đảo (`Tile.island`, đảo của ô 0 là 0), `homeIslands`, sa mạc về đảo chính và vàng ra đảo nhỏ (chỉ hoán đổi, giữ cân bằng tài nguyên); phân tài nguyên cân bằng/hỗn loạn; token số + leo đồi tránh 6/8 kề nhau; dựng đỉnh/cạnh; cảng; biển; bounds.
4. `GameEngine`: `createGame` + đủ 22 handler (`placeSettlement, placeRoad, placeShip, roll, discard, moveRobber, moveShip, chooseGold, build, endRoadBuilding, buyDev, playDev, bankTrade, proposeTrade, respondTrade, counterTrade, confirmTrade, cancelTrade, endTurn, passBuild, setController, retirePlayer`), đường dài nhất (DFS), đội quân lớn nhất, sự kiện mỗi vòng, đất chuyển mình, xúc xắc cân bằng, pha xây đặc biệt 5–6 người, úp bàn cờ, nhà bí mật (`resolveBlind`), sương mù (`viewFor`, `fogResolve`, `discover`).
5. Luật Biển cả (đúng như web, xem `tests/seafarers.test.ts`):
   - Tàu nối vào nhà/thành phố của mình hoặc tàu của mình tại đỉnh không có nhà đối thủ; tàu không nối trực tiếp với đường; cạnh ven biển chỉ có đường **hoặc** tàu. Đầu ván, nhà ven biển được đặt tàu thay đường. Thẻ Xây đường nhận lẫn đường và tàu.
   - Tuyến dài nhất tính cả đường lẫn tàu; đổi loại chỉ tại nhà/thành phố của mình; nhà đối thủ cắt tuyến.
   - Dời tàu: 1 lần/lượt, chỉ trong pha chính, chỉ tàu mở, không dời tàu vừa đóng trong lượt; `built` giữ nguyên khi dời. Vòng tàu khép kín không chạm nhà mình cũng tính là mở.
   - Hải tặc: chỉ ở ô biển khác ô hiện tại; chặn đóng/dời tàu trên ô đó; chỉ cướp chủ tàu trên ô (không cướp nhà ven biển); thẻ Hiệp sĩ và số 7 được chọn dời kẻ trộm hoặc hải tặc; kẻ trộm hiền lành bảo vệ cả tàu.
   - Mỏ vàng: tung ra thì ghi `goldPending` (nhà 1, thành phố 2) và mở pha `gold`, nhiều người cùng chọn như pha `discard`; ngân hàng hết thì giới hạn số chọn và kết thúc pha; người rời ván thì bỏ lượt chọn.
   - Thưởng 2 điểm cho nhà đầu tiên trên mỗi đảo mới (`islandBonusVP`, không tính đảo đặt đầu ván); `mainland` chỉ cho đặt đầu ván trên đảo chính; mục tiêu điểm đi qua `vpTargetFor`.
6. `Bot`: `act` + `hint`, ba mức `easy/normal/hard`. Phần Biển cả: `bestShip`, kế hoạch vượt biển (`seaTargets`, `shipDistances`, `bestSeaPlan`, `seaPlan`, hằng `SHIP_COST_PTS = 1.8`), `shipMove`, `shipOverRoad`, `pirateMove`, `gold`.
7. Test (JVM, chạy trong vài giây):
   - Port `tests/rules.test.ts`.
   - **Sim bất biến:** 300 ván bot đấu bot qua mọi bản đồ/chế độ (`makeConfig(i)` của `scripts/sim.ts`), sau mỗi action kiểm tra: bảo toàn tài nguyên với ngân hàng, số quân còn lại, luật khoảng cách, đường nối mạng, không nhân đôi thẻ, phát hiện người thắng.
   - **Đối chiếu với bản web (golden):** ở repo web chạy `pnpm fixtures [số ván] [file ra]` (script `scripts/export-fixtures.ts`, mặc định 30 ván → `fixtures/engine.json`, ~0.8 MB, không commit ở repo web). Copy file vào `engine/src/test/resources/` của repo Android. Mỗi ván gồm:
     - `config`: cấu hình đầy đủ (đọc thẳng từ JSON, không cần port `makeConfig`);
     - `first`, `board`: người đi đầu, `tiles[{q,r,res,num}]`, `ports[{edge,type,ratio}]`, `edges[[a,b]]`, số đỉnh, số ô biển, vị trí kẻ trộm → kiểm tra `createGame` (RNG + sinh bản đồ + cách đánh số đỉnh/cạnh);
     - `actions`: toàn bộ chuỗi action của ván bot‑đấu‑bot; `rng[k]`: trạng thái RNG sau action thứ k → chỉ ra đúng action đầu tiên bị lệch;
     - `final`: pha, người thắng, lượt, vòng, ngân hàng, công trình, đường, điểm và tay bài từng người...

     Viết hai test: (1) **phát lại** `actions` qua `applyAction` và so `rng[k]` + `final` (kiểm tra engine); (2) để **bot Kotlin tự chơi** với cùng vòng lặp (`pendingActors` → người đầu tiên có nước đi) và so từng action với `actions[k]` (kiểm tra bot). Đây là cách rẻ nhất để chứng minh port đúng luật.
   - Tất định: cùng seed chạy 2 lần ra cùng trạng thái.
   - **Biển cả:** port `tests/seafarers.test.ts` và `tests/seafarers-maps.test.ts` (port trước tiên test "seafarers board: land ids, tiles and ports identical to base"); sim 60 ván Biển cả với các bất biến tàu của `runSeaSim` (`scripts/sim.ts --sea`).
   - **Golden cho Biển cả (việc phải làm ở repo web trước):** `scripts/export-fixtures.ts` hiện chưa xuất ván Biển cả. Mở rộng để xuất thêm ván trên `seaIslands` và `mainland`, có và không có `islandBonus`; thêm vào `final`: `ships`, `pirate`, `goldPending`, `islandBonus`, `shipsLeft`; thêm vào `board`: số ô biển, số đỉnh/cạnh biển, `homeIslands`; tăng `FORMAT` từ 1 lên 2. Không đổi định dạng của ván Cơ bản.

### Bước 3 — Domain + data
1. `GameSession`, các repository interface và use case (mục 3.3).
2. `SettingsRepository` (tốc độ bot, âm thanh, rung), `LobbyConfigRepository` (cấu hình gần nhất, trộn với `defaultConfig` để option mới luôn tồn tại), `KingdomRepository`, `CustomMapRepository` trên DataStore.
3. `GameSaveStore`: JSON trong `filesDir`, ghi nguyên tử (file tạm rồi rename), debounce 1.5s, flush khi app vào nền (`ProcessLifecycleOwner`), có số `version` để di trú về sau.
4. `LocalGameSession` + `BotDriver`; test bằng `runTest` + Turbine (ván toàn bot chạy tới `gameOver`, lưu/khôi phục ván, kể cả ván Biển cả như `tests/app.test.ts`).

### Bước 4 — Bàn cờ Canvas
1. `BoardCanvas` tĩnh: biển, ô, token + vạch xác suất (`probLook`), cảng, đường, nhà, thành phố, kẻ trộm.
2. Pan/zoom, nút về giữa, hit‑test đỉnh/cạnh/ô.
3. Trạng thái ô úp, ô sương mù, số ẩn, lớp sương mù theo `vision`.
4. Hoạt ảnh công trình mới, lật ô, ô vừa ra số.
5. Preview composable với vài seed + screenshot test cho các chế độ.

### Bước 5 — Ván chơi tối thiểu (cổ điển, 1 người + bot)
1. `GameViewModel` + `GameScreenMapper`; `GameScreen` có 2 bố cục theo `WindowSizeClass`: **điện thoại (khoá dọc)** gồm dải thẻ người chơi mỏng trên cùng, bàn cờ chiếm trọn chiều ngang, tay bài + thanh hành động ở dưới trong tầm ngón cái; **màn lớn (≥ 600dp, xoay tự do)** gồm bàn cờ và bảng bên cạnh. Không có bố cục ngang cho điện thoại. Bản đồ lớn và bản đồ biển dựa vào pan/zoom + nút về giữa.
2. TopBar (pha, banner, xúc xắc, lịch sử tung), thẻ người chơi (điểm, số bài, đường dài nhất, đội quân), tay bài, nút xây (đường/nhà/thành phố/mua thẻ) có kiểm tra đủ tài nguyên, kết thúc lượt.
3. Luồng đầy đủ: đặt đầu ván → tung → sản xuất → bỏ thẻ khi ra 7 → kẻ trộm + chọn nạn nhân → xây → đổi với ngân hàng/cảng → thẻ phát triển (hiệp sĩ, xây đường, năm bội thu, độc quyền) → thắng + màn tổng kết + chơi lại.
4. Nhật ký ván (tên người chơi tô màu, icon tài nguyên), toast lỗi, tiếp tục ván đã lưu từ Menu.

### Bước 6 — Đủ tính năng ván chơi (bản Cơ bản)
1. Giao dịch giữa người chơi: mời, đồng ý/từ chối, **mặc cả** (`counterTrade`), xác nhận.
2. Các chế độ: bịt mắt (úp bàn cờ + lật tất cả), sương mù chiến tranh (dời công trình khi đụng), nhà bí mật (lật mở + dời khi trùng), số bí mật, sự kiện mỗi vòng (banner thông báo), đất chuyển mình, xúc xắc cân bằng, kẻ trộm hiền lành, không kẻ trộm, khởi đầu bằng thành phố, pha xây đặc biệt, tăng tốc.
3. Chơi chung một máy: màn chuyền máy (`privacyOn`/`locked`), tự chọn ghế đang xem (`computeViewer`).
4. Nút 💡 gợi ý, chế độ xem bot đấu nhau, 4 tốc độ bot, menu trong ván (rời ván, âm thanh).

### Bước 7 — Biển cả: giao diện
Engine và bot Biển cả đã có từ bước 2; bước này chỉ làm phần nhìn và thao tác (tham chiếu `src/board/BoardView.ts`, `src/ui/game/ActionBar.tsx`, `Modals.tsx`, `Players.tsx`, `signals.ts`, `src/ui/screens/Lobby.tsx`).
1. `BoardCanvas`: vành biển 2 ô chơi được; tàu là thuyền nhỏ ở giữa cạnh, xoay theo cạnh; hải tặc là thuyền tối trên ô biển; hit-test cạnh biển và ô biển; hoạt ảnh cho Fx `shipMoved`, `pirate`.
2. Thanh hành động: nút đóng tàu (kiểm tra `COSTS.ship`, `shipsLeft`, `legalShips`); công tắc đường/tàu khi đặt đầu ván (`legalSetupShips`) và khi dùng thẻ Xây đường; dời tàu bằng 2 chạm (chọn trong `movableShips`, rồi chọn trong `shipDestinations`).
3. Modal: `GoldModal` cho pha `gold` (số phải chọn = `min(goldPending, tổng ngân hàng)`); chọn dời kẻ trộm hay hải tặc khi ra 7 hoặc dùng Hiệp sĩ (`legalPirateTiles`); modal chọn nạn nhân theo `target` (`pirateTargets`).
4. Thẻ người chơi: số tàu còn lại, điểm thưởng đảo, mục tiêu điểm qua `vpTargetFor`; chữ "Con đường dài nhất" đổi thành "Tuyến đường dài nhất" khi chơi Biển cả; log và chuỗi mới trong `strings.xml`.
5. Lobby: bật/tắt Biển cả; danh sách bản đồ biển (mặc định bản đầu tiên); khoá các chế độ thông tin ẩn và các bộ cài sẵn không hợp; gợi ý điểm thắng (`suggestVp`); đổi bản đồ tự lùi về bản hợp lệ (`applyShape`); tuỳ chọn thưởng đảo và `maxShips`.
6. Chơi chung một máy: pha `gold` nhiều người chọn lần lượt qua màn chuyền máy, giống pha `discard`.

### Bước 8 — Các màn còn lại
1. **Lobby:** người chơi (2–8, người/bot + mức, tên, màu, cờ), 8 bộ cài sẵn, bật/tắt chế độ, luật tuỳ chỉnh (điểm thắng, giới hạn thẻ, số lượt đặt, quà khởi đầu, số quân, bộ thẻ, vàng, cảng, sa mạc), chọn bản đồ kèm thumbnail, preview sống, seed.
2. **Trình tạo bản đồ:** lưới lục giác bán kính 5, cọ tài nguyên/số/xoá, lưu nhiều bản đồ, chia sẻ bằng mã. Giữ **đúng định dạng mã của web** (`Base64(JSON CustomMap)`, xem `encodeMap/decodeMap` trong `Editor.tsx`) để dán qua lại giữa web và app.
3. **Cờ vương quốc:** hỗ trợ định dạng lưới 12×12 (144 ký tự hex, bảng màu `FLAG_PAL`) trước, gồm `patternFlag` mặc định và trình vẽ pixel; định dạng ảnh PNG 120×80 làm sau nếu cần.
4. **Trợ giúp** (luật + ghi công bản gốc) và **Cài đặt** (âm thanh, rung, tốc độ bot, ngôn ngữ).

### Bước 9 — Hiệu ứng và cảm giác
1. Xúc xắc: chạm để tung, **nhấn giữ để lấy đà** (`power` 0–1 chỉ ảnh hưởng hoạt ảnh), hoạt ảnh lắc/rơi.
2. Thẻ bay: từ ô → tay, giữa hai người khi giao dịch/cướp, tới/từ ngân hàng (lớp overlay dùng toạ độ màn hình do `BoardCanvas` cung cấp).
3. Pháo giấy khi thắng, banner sự kiện, số nổi "+2 🌾".
4. `AudioTrackSfxManager`: dựng sẵn PCM cho từng hiệu ứng theo công thức trong `sfx.ts` (sine/triangle/square/sawtooth + nhiễu trắng) và phát bằng `AudioTrack`; thêm haptic cho tung xúc xắc, xây, kẻ trộm.

### Bước 10 — Online chung Wi‑Fi
1. `WireMessage`, `Redactor` (`redactFor`, `toWire`, `fromWire`), `BoardVersion`; test đơn vị port từ `tests/redact.test.ts`.
2. `LanHost` (Ktor server + NSD đăng ký + foreground service) và `LanClient` (NSD tìm + Ktor client); `HostGameSession`, `GuestGameSession`.
3. Màn Online: tạo phòng (sức chứa, đóng/mở phòng, đuổi khách), danh sách phòng tìm thấy, nhập tay địa chỉ, phòng chờ của khách; Lobby của host có loại ghế "bạn bè".
4. Kết nối lại, heartbeat, bỏ phiếu khi rớt mạng, mở lại phòng, luồng xin quyền `ACCESS_LOCAL_NETWORK`.
5. Test tích hợp với kênh trong bộ nhớ (như `tests/net.test.ts`, gồm một ván Biển cả): trạng thái khách == trạng thái host đã lọc ở mọi bước, không lộ bí mật, thông điệp gian lận bị từ chối. Test thật: 2–3 máy cùng Wi‑Fi, tắt/bật Wi‑Fi giữa ván.

### Bước 11 — Chất lượng và phát hành
1. Hiệu năng: Compose compiler report (không còn class unstable trong UiState), Layout Inspector đếm recomposition khi bot đi, Baseline Profile + Macrobenchmark (khởi động, cuộn/zoom bàn cờ 61 ô).
2. Màn hình lớn, xoay máy, gập (Android 17 bỏ quyền từ chối resize trên màn ≥ 600dp; kiểm tra điện thoại vẫn khoá dọc còn tablet/máy gập chuyển đúng giữa 2 bố cục), khôi phục sau process death (ván đang chơi lấy lại từ file lưu).
3. Trợ năng: `contentDescription`, vùng chạm ≥ 48dp, tương phản màu người chơi.
4. Ký app, `versionCode/versionName`, R8 + kiểm tra rule cho kotlinx.serialization/Ktor, trang store (tên "Hex Island", không nhắc thương hiệu bên thứ ba).

## 6. Quy ước code Compose/Kotlin
- State hoisting; composable màn hình stateless; `collectAsStateWithLifecycle()`.
- UiState là data class `@Immutable`, danh sách dùng `ImmutableList`; `key` ổn định cho `LazyColumn`.
- Đọc state muộn (lambda modifier, pha draw) cho mọi thứ chạy theo frame; `derivedStateOf` cho giá trị suy ra từ state thay đổi nhanh.
- Không gọi engine trên main thread: mapper, bot, sinh bản đồ chạy `HexDispatchers.default`; I/O chạy `HexDispatchers.io`. Luôn inject `HexDispatchers` từ `:kernel`, không gọi `Dispatchers.*` tại chỗ dùng.
- Reducer DRE-KT thuần, không I/O; mọi I/O đi qua `AsyncOp` + use case. ViewModel gọi use case, không gọi repository.
- Màu, khoảng cách, cỡ chữ lấy từ token `Hx*` của `:theme`, không viết cứng.
- Feature mới phải thêm vào `app/AppFeatures.kt` (không có cơ chế tự phát hiện); `AppFeaturesTest` bắt lệch.
- Không có logic luật chơi trong ViewModel/composable: mọi quyết định hợp lệ hỏi engine.
- Chuỗi hiển thị nằm trong `strings.xml`, không viết cứng trong code.

## 7. Kiểm chứng
- `./gradlew :engine:test` — test luật (Cơ bản + Biển cả), sim 300 ván bất biến + 60 ván Biển cả, tất định, golden với web (fixtures `FORMAT` 2).
- `./gradlew :data:testDebugUnitTest` — redact + host/khách trong bộ nhớ, lưu/khôi phục ván.
- `./gradlew :app:testDebugUnitTest` — `AppGraphTest` (mọi binding Koin dựng được), `AppFeaturesTest`.
- `./gradlew test lint detekt assembleDebug` — toàn bộ, chạy trên CI mỗi lần push.
- `./gradlew connectedDebugAndroidTest` — Compose UI test: một ván cổ điển 1 người + 3 bot từ Lobby tới màn thắng.
- Thủ công trên máy thật: mỗi bộ cài sẵn một ván; chuyền máy 2 người với sương mù; thoát app giữa ván rồi tiếp tục; online LAN 3 máy có rớt mạng, bỏ phiếu, mở lại phòng; một ván Biển cả trên mỗi bản đồ biển (đóng và dời tàu, hải tặc, mỏ vàng, thưởng đảo) và một ván Biển cả qua LAN.

## 8. Thứ tự ưu tiên và rủi ro
- Mốc 1 (bước 0–5): chơi được ván cổ điển với bot. Mốc 2 (bước 6): đủ chế độ bản Cơ bản. Mốc 3 (bước 7): Biển cả. Mốc 4 (bước 8–9): các màn còn lại + hiệu ứng, ngang tính năng offline với web. Mốc 5 (bước 10): LAN. Mốc 6 (bước 11): phát hành.
- Rủi ro chính: (1) sai lệch luật khi port → đã chặn bằng sim + golden; (2) quyền mạng cục bộ mới của Android 17 → làm thử nghiệm nhỏ NSD + WebSocket ngay đầu bước 10; (3) router chặn mDNS → luôn có đường nhập tay địa chỉ; (4) phiên bản thư viện thay đổi nhanh → chỉ ghim sau khi kiểm tra ở bước 0, dùng version catalog một chỗ; (5) bộ kit `kta-*` thiên về KMP → kiểm tra profile ngay bước 0, chỗ nào kit giả định `commonMain` thì làm tay theo mục 3.1; (6) id đỉnh/cạnh biển lệch với web làm hỏng golden → port test "land ids identical to base" đầu tiên.
