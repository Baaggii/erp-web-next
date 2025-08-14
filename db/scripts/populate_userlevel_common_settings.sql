-- Initialize common_settings using existing system_settings values
UPDATE code_userlevel
SET common_settings = system_settings;
