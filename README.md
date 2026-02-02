# grok-rate-limit-display-modified
Modified version of the Grok Rate Limit Display userscript to show query limits in Grok AI. Changes: always visible, position in the lower right corner more towards the center, no hiding while typing. Original by Blankspeaker on GreasyFork.


## Grok Rate Limit Display - Modified

Modified version of the original userscript to display query limits in Grok AI (grok.x.ai).
Always shows high | low (or timer | low), in a fixed position in the lower right corner towards the center, without disappearing while typing.

### Features:
- Automatic update every 30 seconds, when sending a message, or when clicking on the display.
- Shows high-effort and low-effort limits simultaneously in Auto mode.
- No overlap hide (does not disappear with long text).
- Fixed position (bottom: 24px; right: 150px).
- Countdown timer when high is exhausted.

### Installation
1. Install Tampermonkey or Greasemonkey in your browser.
2. Click the .user.js link or paste the code into script.
3. Open grok.x.ai and test.

### Credits
- Original by Blankspeaker, ported from CursedAtom's extension.
- Original license: MIT (see LICENSE).
- Modifications by Phuderoso (John HM Goncalves)
(adaptation for always visible and custom position).

### License
MIT License - see LICENSE file.

### Contact
Issues or suggestions? Open an issue in the repo.
