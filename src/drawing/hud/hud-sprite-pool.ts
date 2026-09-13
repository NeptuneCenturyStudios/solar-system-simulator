/** Minimal contract the pool needs. Satisfied by both `HudSprite` and `SharedTextureSprite`. */
export interface IPoolableSprite {
    visible: boolean;
    dispose(): void;
}

/**
 * A reuse pool for overlay sprites whose count varies from frame to frame — one per visible
 * body name, per damaged body, per on-screen threat, and so on.
 *
 * This replaces the `syncPool` that `PlanetNameIndicator`, `HealthBarIndicator` and
 * `ThreatIndicator` each carried a copy of:
 *
 * ```ts
 * while (pool.length > desired) { pool.pop()!.sprite.visible = false; }
 * while (pool.length < desired) { pool.push(createEntry()); }
 * ```
 *
 * That version leaked. A popped entry was dropped from the array, but its `THREE.Sprite` was
 * still a child of the overlay scene holding a canvas, a texture and a material — and because
 * the entry itself was unreachable, growing back always built a brand new one. Since the count
 * is driven by which bodies are on screen, it oscillates constantly during normal flight, so
 * the overlay scene grew without bound and `dispose()` could not reach the orphans.
 *
 * Here shrinking moves entries to a free list (hidden, still in the scene, still referenced)
 * and growing draws from that list before constructing anything. Nothing is orphaned, and
 * `dispose()` reaches active and free entries alike.
 */
export class HudSpritePool<T extends IPoolableSprite> {
    private readonly active: T[] = [];
    private readonly free: T[] = [];

    constructor(private readonly factory: () => T) {}

    /** Number of sprites this pool has ever created — active plus retired. Useful in leak checks. */
    get size(): number {
        return this.active.length + this.free.length;
    }

    /**
     * Return exactly `count` visible sprites, reusing retired ones where possible.
     *
     * The returned array is the pool's own live array — read it, index it, but do not retain
     * it across frames, because the next `acquire` mutates it in place.
     */
    acquire(count: number): readonly T[] {
        while (this.active.length > count) {
            const sprite = this.active.pop()!;
            sprite.visible = false;
            this.free.push(sprite);
        }

        while (this.active.length < count) {
            const sprite = this.free.pop() ?? this.factory();
            this.active.push(sprite);
        }

        return this.active;
    }

    /** Hide every active sprite and retire it for reuse, without disposing anything. */
    releaseAll(): void {
        this.acquire(0);
    }

    /** Dispose every sprite this pool owns, active and retired. */
    dispose(): void {
        for (const sprite of this.active) sprite.dispose();
        for (const sprite of this.free) sprite.dispose();
        this.active.length = 0;
        this.free.length = 0;
    }
}
