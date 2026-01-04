# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2026-01-04]

### Changed

- Migrate ZVV API from legacy `online.fahrplan.zvv.ch` to new `zvv.hafas.cloud` HAFAS endpoint
- Update date/time parsing for new API format (YYYY-MM-DD HH:mm:ss)
- Update vehicle type mapping to use category names instead of icon identifiers

### Fixed

- Fix platform field parsing to correctly extract track numbers from new API response
- Strip "Gl." prefix from platform values for cleaner display
- Fix Docker build permission error when running yarn install
- Fix sqlite3 code execution vulnerability by upgrading to 5.1.7

### Security

- Upgrade sqlite3 to 5.1.7 to address code execution vulnerability
