module Avoidance

public export
data BurnDirection = Prograde | Retrograde

public export
Show BurnDirection where
  show Prograde = "PROGRADE"
  show Retrograde = "RETROGRADE"

public export
record BurnParameters where
  constructor MakeBurn
  satelliteId : String
  deltaV : Double
  direction : BurnDirection
  expectedAltitudeShift : Double

public export
data BurnError = OutOfBounds Double 
               | InsufficientClearance Double Double 
               | HighThermalStress Double
               | HighRadiationRisk Double
               | AtmosphericReentryRisk Double

public export
showError : BurnError -> String
showError (OutOfBounds val) = "Delta-V magnitude " ++ show val ++ " m/s is out of physical limits (0.1 to 15.0 m/s)."
showError (InsufficientClearance newAlt reqAlt) = "Post-burn altitude " ++ show newAlt ++ " km does not clear threat zone altitude (requires " ++ show reqAlt ++ " km)."
showError (HighThermalStress stress) = "Maneuver blocked: Thermal stress is " ++ show stress ++ " °C (maximum 8.0 °C allowed during burns)."
showError (HighRadiationRisk prob) = "Maneuver blocked: SEU probability is " ++ show prob ++ " (maximum 0.015 allowed due to radiation storm)."
showError (AtmosphericReentryRisk newAlt) = "Maneuver blocked: Retrograde burn altitude " ++ show newAlt ++ " km drops below atmospheric reentry limit (150.0 km)."

||| Type representing a verified burn where deltaV and safety clearance are mathematically validated
public export
data ValidatedBurn : Type where
  MakeValidated : (params : BurnParameters) -> ValidatedBurn

||| Function to validate burn parameters mathematically
public export
validateBurn : (satId : String) -> (dv : Double) -> (dirStr : String) -> (currentAlt : Double) -> (debrisAlt : Double) -> (safetyMargin : Double) -> (thermalStress : Double) -> (seuProbability : Double) -> Either BurnError ValidatedBurn
validateBurn satId dv dirStr currentAlt debrisAlt safetyMargin thermalStress seuProbability =
  if dv < 0.1 || dv > 15.0 then
    Left (OutOfBounds dv)
  else if thermalStress > 8.0 then
    Left (HighThermalStress thermalStress)
  else if seuProbability > 0.015 then
    Left (HighRadiationRisk seuProbability)
  else
    let dir = if dirStr == "RETROGRADE" then Retrograde else Prograde in
    let multiplier = if currentAlt > 1000.0 then 15.0 else 1.8 in
    let shift = dv * multiplier in
    let newAlt = if dirStr == "RETROGRADE" then currentAlt - shift else currentAlt + shift in
    if dirStr == "RETROGRADE" && newAlt < 150.0 then
      Left (AtmosphericReentryRisk newAlt)
    else
      let requiredAlt = debrisAlt + safetyMargin in
      if newAlt < requiredAlt then
        Left (InsufficientClearance newAlt requiredAlt)
      else
        Right (MakeValidated (MakeBurn satId dv dir shift))
