export interface QA { q: string; a: string; }

export const FAQS: QA[] = [
    {
        q: "What is SprigScope?",
        a: "It's a way to see your Sprig's screen right in your browser. Mirror a real one over USB or a camera or just mess around with the digital version."
    },
    {
        q: "Do I need a real Sprig to use it?",
        a: "Nope. You can play around with the digital version without any hardware. A real sprig is only needed if you want to mirror its screen.",
    },
    {
        q: "I plugged in over USB and the screen is black. Is it broken?",
        a: "Almost certainly not. A stock sprig runs games but doesn't broadcast its screen over USB, there's nothing to mirror unless it's running the screen-streaming firmware. We'll tell you the port is open but silent."
    },
    {
        q: "Which browser work?",
        a: "The USB option needs WebSerial, so it's Chrome or Edge on desktop. The camera option works on most modern browser. Firefox and Safari can't do the USB path."
    },
    {
        q: "How does the camera mirror work?",
        a: "Point your camera at the Sprig, drag the four corners onto the screen, and we crop and straighten it. View-only works with any Sprig, and only as sharp as your camera."
    },
    {
        q: "Can I control the Sprig from my keyboard?",
        a: "Yes, WASD is the left pad and IJKL is the right pad. You can also tap the on-screen buttons. Presses go back to the connected real Sprig over USB"
    },
    {
        q: "Is my screen or camera sent everywhere?",
        a: "Nope, everything happens locally in your browser, nothing is uploaded to a server.",
    },
    {
        q: "Is it open source?",
        a: "Yep! Built on Hack Club's open source Sprig and released under the MIT license. Source is on GitHub."
    },
];