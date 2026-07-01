import { type PlaylistEntry } from '../utilities/playlist';
import { Panel } from './panel';

export class PlaylistPanel extends Panel {
    private btnClose: HTMLButtonElement | null = null;
    private btnPrev: HTMLButtonElement | null = null;
    private btnPlayPause: HTMLButtonElement | null = null;
    private btnNext: HTMLButtonElement | null = null;
    private trackListEl: HTMLElement | null = null;

    /** Index of the item currently marked active in the rendered list. */
    private activeIndex: number = -1;

    initialize(): void {
        this.btnClose = document.getElementById(
            'btn-close-playlist-panel'
        ) as HTMLButtonElement | null;
        this.btnPrev = document.getElementById('btn-playlist-prev') as HTMLButtonElement | null;
        this.btnPlayPause = document.getElementById(
            'btn-playlist-play-pause'
        ) as HTMLButtonElement | null;
        this.btnNext = document.getElementById('btn-playlist-next') as HTMLButtonElement | null;
        this.trackListEl = document.getElementById('playlist-track-list') as HTMLElement | null;

        if (this.btnClose) {
            this.btnClose.onclick = () => {
                this.hide();
            };
        }

        if (this.btnPrev) {
            this.btnPrev.onclick = () => this.emit('prev');
        }

        if (this.btnPlayPause) {
            this.btnPlayPause.onclick = () => this.emit('playPause');
        }

        if (this.btnNext) {
            this.btnNext.onclick = () => this.emit('next');
        }
    }

    /**
     * Update the play/pause button icon to reflect current playback state.
     */
    setPlayingState(isPlaying: boolean): void {
        if (!this.btnPlayPause) return;
        const icon = this.btnPlayPause.querySelector('.material-symbols-outlined');
        if (icon) {
            icon.textContent = isPlaying ? 'pause' : 'play_arrow';
        }
        this.btnPlayPause.title = isPlaying ? 'Pause' : 'Play';
    }

    /**
     * Render the full shuffled playlist. Clears any existing list.
     * The item at currentIndex will be highlighted and scrolled into view.
     */
    setPlaylist(entries: PlaylistEntry[], currentIndex: number): void {
        if (!this.trackListEl) return;
        this.trackListEl.innerHTML = '';
        this.activeIndex = -1;

        entries.forEach((entry, i) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.dataset.index = String(i);

            const trackNum = document.createElement('span');
            trackNum.className = 'playlist-item__num';
            trackNum.textContent = String(i + 1);

            const trackTitle = document.createElement('span');
            trackTitle.className = 'playlist-item__title';
            trackTitle.textContent = entry.title;

            item.appendChild(trackNum);
            item.appendChild(trackTitle);

            item.onclick = () => {
                this.emit<number>('trackSelected', i);
            };

            this.trackListEl!.appendChild(item);
        });

        this.setCurrentTrack(currentIndex);
    }

    /**
     * Move the active highlight to the given index without re-rendering the list.
     */
    setCurrentTrack(index: number): void {
        if (!this.trackListEl) return;

        // Remove old active class
        if (this.activeIndex >= 0) {
            const old = this.trackListEl.querySelector(
                `[data-index="${this.activeIndex}"]`
            ) as HTMLElement | null;
            old?.classList.remove('playlist-item--active');
        }

        this.activeIndex = index;

        if (index < 0) return;

        const next = this.trackListEl.querySelector(
            `[data-index="${index}"]`
        ) as HTMLElement | null;
        if (next) {
            next.classList.add('playlist-item--active');
            next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}
