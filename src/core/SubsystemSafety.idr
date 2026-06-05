module SubsystemSafety

public export
data SubsystemError = LowPower Double | FuelPressureOutOfBounds Double | InsufficientPropellant Double Double | ADCSDriftLimitExceeded Double

public export
showError : SubsystemError -> String
showError (LowPower soc) = "Battery state-of-charge " ++ show soc ++ "% is critically low (minimum 15.0% required for operations)."
showError (FuelPressureOutOfBounds press) = "Fuel line pressure " ++ show press ++ " psi is outside safe operational limits (100.0 to 600.0 psi)."
showError (InsufficientPropellant req avail) = "Insufficient propellant: maneuver requires " ++ show req ++ " kg but only " ++ show avail ++ " kg is available."
showError (ADCSDriftLimitExceeded rate) = "ADCS slew/drift rate " ++ show rate ++ " deg/s exceeds safety threshold (maximum 2.0 deg/s, minimum 0.05 deg/s)."

||| Type representing verified subsystem states
public export
data ValidatedState : Type where
  MakeValidatedState : String -> ValidatedState

||| Enforces battery power grid constraints
public export
validatePowerState : (satId : String) -> (soc : Double) -> Either SubsystemError ValidatedState
validatePowerState satId soc =
  if soc < 15.0 then
    Left (LowPower soc)
  else
    Right (MakeValidatedState satId)

||| Enforces thruster fuel capacity and pressure boundaries
public export
validateThrusterFuel : (satId : String) -> (deltaV : Double) -> (propellantMass : Double) -> (fuelPressure : Double) -> Either SubsystemError ValidatedState
validateThrusterFuel satId deltaV propellantMass fuelPressure =
  if fuelPressure < 100.0 || fuelPressure > 600.0 then
    Left (FuelPressureOutOfBounds fuelPressure)
  else
    let reqFuel = deltaV * 12.0 in
    if reqFuel > propellantMass then
      Left (InsufficientPropellant reqFuel propellantMass)
    else
      Right (MakeValidatedState satId)

||| Enforces ADCS slew/drift rates limits
public export
validateADCSState : (satId : String) -> (driftRate : Double) -> Either SubsystemError ValidatedState
validateADCSState satId driftRate =
  if driftRate < 0.05 || driftRate > 2.0 then
    Left (ADCSDriftLimitExceeded driftRate)
  else
    Right (MakeValidatedState satId)
