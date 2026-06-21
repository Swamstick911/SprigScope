# Mirroring a real Sprig

SprigScope can show the screen of a real Sprig that is plugged in over USB. The
hardware does everything itself (including WiFi), and the page just draws whatever
the device sends. This is how you watch firmware that needs a network: let the
real Sprig connect, and mirror it.

On the page: open the firmware panel, click **Connect a real Sprig**, and pick the
device in the browser popup. Works in Chrome and Edge (they have WebSerial).

For this to show anything, the firmware has to stream its screen out over USB.
Here is the format.

## The wire format

Over the USB serial port, send one of these per frame, as often as you like:

```
magic   4 bytes   A5 5A C3 3C
pixels  40960 bytes   160 x 128, row major (top left first), RGB565, high byte first
```

That is it. 4 magic bytes, then the framebuffer. Send a frame whenever the screen
changes, or a few times a second. The page resynchronises on the magic, so it is
fine if a frame is dropped.

Optional, the other direction: the page sends one ASCII byte per button press,
one of `W A S D I J K L`. Read them if you want the on screen buttons to drive the
real device too.

## Firmware sketch (Rust, embassy USB CDC)

Assuming you already build a `fb: [u16; 160 * 128]` of RGB565 pixels before
pushing them to the ST7735, send the same buffer to the USB class:

```rust
const MAGIC: [u8; 4] = [0xA5, 0x5A, 0xC3, 0x3C];

async fn stream_screen(class: &mut CdcAcmClass<'_, D>, fb: &[u16; 160 * 128]) {
    let _ = class.write_packet(&MAGIC).await;
    let mut packet = [0u8; 64]; // CDC max packet size
    let mut n = 0;
    for &c in fb.iter() {
        packet[n] = (c >> 8) as u8;     // high byte first
        packet[n + 1] = (c & 0xff) as u8;
        n += 2;
        if n == 64 {
            let _ = class.write_packet(&packet).await;
            n = 0;
        }
    }
    if n > 0 {
        let _ = class.write_packet(&packet[..n]).await;
    }
}
```

Call `stream_screen` once per rendered frame (after your WiFi connect, or always).
40960 bytes per frame is comfortable for USB full speed at a handful of frames per
second.

If your pixels are little endian, just swap the two `packet[...]` lines.

## Notes

- WebSerial is Chrome and Edge only right now. Safari has no support and Firefox
  needs a flag.
- The browser needs a user click to open the port, which the Connect button gives it.
- Stock Sprig firmware does not stream its screen, so mirroring only works with
  firmware that sends the format above.
