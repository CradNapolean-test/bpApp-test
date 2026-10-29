// Limits the database enforces (migrations 0108-0114), kept in one place so the forms, the save checks and the
// error messages agree. If one changes, change the matching CHECK constraint in a new migration too.

export const BODYWEIGHT_KG = { min: 20, max: 400 } as const;
export const MEASUREMENT_CM = { min: 10, max: 300 } as const;

export const bodyweightMessage = `Bodyweight must be between ${BODYWEIGHT_KG.min} and ${BODYWEIGHT_KG.max} kg.`;
export const measurementMessage = `Measurements must be between ${MEASUREMENT_CM.min} and ${MEASUREMENT_CM.max} cm.`;

export const isValidBodyweight = (kg: number) => kg >= BODYWEIGHT_KG.min && kg <= BODYWEIGHT_KG.max;
export const isValidMeasurement = (cm: number) => Number.isFinite(cm) && cm >= MEASUREMENT_CM.min && cm <= MEASUREMENT_CM.max;
