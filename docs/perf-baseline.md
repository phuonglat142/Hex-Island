# Baseline hiệu năng (Giai đoạn 0)

Đo trong Node bằng `pnpm build && pnpm baseline` (script `scripts/baseline.ts`). Chưa đo FPS, `renderer.info`, thời gian `buildStatic` hay `render()` UI: những số đó cần Chrome DevTools (CPU throttle 4x/6x), xem plan.

- Máy: Apple M4, 10 lõi, Node v22.22.0, darwin/arm64
- Ngày đo: 2026-11-13

## Sim bot

300 ván bot đấu bot (`runSim(300)`, kèm kiểm tra bất biến sau mỗi hành động): **3250 ms** (trung vị của 3 lần: 3241 / 3250 / 3338 ms).

## generateBoard theo hình dạng (ms/lần, trung bình 50 lần)

| Hình dạng | cỡ mặc định | cỡ 40 |
|---|---|---|
| classic | 0.070 | 0.062 |
| mini | 0.053 | 0.041 |
| extended | 0.099 | 0.097 |
| big | 0.152 | 0.125 |
| huge | 0.228 | 0.208 |
| ring | 0.091 | 0.087 |
| star | 0.097 | 0.106 |
| kingdoms | 0.116 | 0.105 |
| islands | 0.350 | 0.726 |
| pangea | 0.192 | 0.440 |

## Bundle

_Chưa có `dist/`: chạy `pnpm build` rồi `pnpm baseline`._
