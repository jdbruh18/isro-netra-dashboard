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
data BurnError = OutOfBounds Double | InsufficientClearance Double Double

public export
showError : BurnError -> String
showError (OutOfBounds val) = "Delta-V magnitude " ++ show val ++ " m/s is out of physical limits (0.1 to 15.0 m/s)."
showError (InsufficientClearance newAlt reqAlt) = "Post-burn altitude " ++ show newAlt ++ " km does not clear threat zone altitude (requires " ++ show reqAlt ++ " km)."

||| Type representing a verified burn where deltaV and safety clearance are mathematically validated
public export
data ValidatedBurn : Type where
  MakeValidated : (params : BurnParameters) -> ValidatedBurn

||| Function to validate burn parameters mathematically
public export
validateBurn : (satId : String) -> (dv : Double) -> (dirStr : String) -> (currentAlt : Double) -> (debrisAlt : Double) -> (safetyMargin : Double) -> Either BurnError ValidatedBurn
validateBurn satId dv dirStr currentAlt debrisAlt safetyMargin =
  if dv < 0.1 || dv > 15.0 then
    Left (OutOfBounds dv)
  else
    let dir = if dirStr == "RETROGRADE" then Retrograde else Prograde in
    let multiplier = if currentAlt > 1000.0 then 15.0 else 1.8 in
    let shift = dv * multiplier in
    let newAlt = if dirStr == "RETROGRADE" then currentAlt - shift else currentAlt + shift in
    let requiredAlt = debrisAlt + safetyMargin in
    if newAlt < requiredAlt then
      Left (InsufficientClearance newAlt requiredAlt)
    else
      Right (MakeValidated (MakeBurn satId dv dir shift))
