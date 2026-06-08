export type ProceduralGenerationWorkUnit = {
    /**
     * Canonical label shown in the UI, e.g. "Creating planet: Proc Planet 3"
     * Keep it short (UI is small).
     */
    label?: string;

    /**
     * Optional grouping so we can distinguish phases (stars/planets/moons/asteroids)
     * in logs/UI without changing the progress bar semantics.
     */
    phase?:
        | 'stars'
        | 'planets'
        | 'moons'
        | 'asteroids'
        | 'finalizing';
};

export type ProceduralGenerationProgress = {
    completed: number;
    total: number;
    workUnit?: ProceduralGenerationWorkUnit;
};

/**
 * Reporter used by procedural generation to drive the progress bar.
 * Semantics: bar is based on "completed bodies" count, not texture pixel substeps.
 */
export interface ProceduralGenerationReporter {
    setTotal(total: number): void;
    report(progress: ProceduralGenerationProgress): void;
}
