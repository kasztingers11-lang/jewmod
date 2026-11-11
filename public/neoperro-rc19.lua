script_key = "FLOW-REPLACE-WITH-YOUR-KEY";










getgenv()['neoperro'] = {
    ['Intro']              = true; -- Show the startup intro once per client session.
    ['Web configs']        = false; -- Allow saved settings to apply over the automatic panel connection.

    ['Checks']             = {
        ['Dead Check']      = {true, true, true};
        ['Wall']            = {true, true, true};
        ['ForceField']      = {true, true, false};
        ['Crew']            = {false, false, false};
        ['Tool']            = {false, true, true};
        ['Ground Shot Check'] = {true, true, true};
    };


    ['Y-Axis']             = {
        ['Enabled']    = false;
        ['Offset']     = 1.0;
        ['SilentAim']  = true;
        ['Aim Assist'] = true;
        ['Triggerbot'] = true;
    };


    ['Resolver']           = {
        ['Enabled'] = true;
    };


    ['Anti-AimViewer']     = {
        ['Enabled'] = true;
    };


    ['Client Bullets']     = {
        ['Enabled'] = true;
    };


    ['Silent Aim']         = {
        ['Enabled']    = true;

        ['Prediction'] = {
            ['Enabled'] = true;
            ['Auto']    = true;
            ['Value']   = 0.128;
        };
        ['Method']     = 'Auto';
        ['Ignore']     = false;
        ['Target']     = {
            ['BasePart'] = 'UpperTorso';

            ['Closest']  = {
                ['Enabled']   = true;
                ['Raycast']   = false;
                ['Selection'] = 'Part';
                ['Axis']      = 'Center';
                ['Sharpness'] = 0.7;
                ['Reduce']    = {
                    ['Center'] = 0.7;
                    ['All']    = 0.7;
                };
            };
        };
        ['Fov']        = {
            ['Method']    = '2d-Box';
            ['2d-Circle'] = {
                ['Visible'] = false;
                ['Size']    = 50;
                ['Color']   = {255, 255, 255};
            };
        };

        ['Toggle']     = {
            ['Enabled'] = true;
            ['Holding'] = false;
            ['Keybind'] = {'P', 'MouseButton2', 'Keyboard'};
        };

        ['Activation'] = {
            ['Holding']       = false;
            ['Unlock Method'] = 'Repeat';
            ['Keybind']       = {'T', 'MouseButton2', 'Keyboard'};
        };

        ['AntiCurve']  = {
            ['Enabled']   = false;
            ['Method']    = '3d-angles';
            ['3d-angles'] = {
                ['Max'] = 2.2;
            };
            ['Endmath']   = {
                ['Radius']    = 120;
                ['WallCheck'] = true;
            };
        };
    };


    ['Aim Assist']         = {
        ['Enabled']    = true;
        ['Aim Calibration'] = {
            ['Enabled']            = false;
            ['Strength']   = 0.026;
            ['Min Speed']  = 12;
            ['Full Speed'] = 600;
            ['Max Speed']  = 300;
            ['Curve']      = {
                ['Enabled'] = false;
                ['Early']   = 0;
                ['Middle']  = 0;
                ['Late']    = 0;
            };
        };

        ['Prediction'] = {
            ['Enabled'] = true;
            ['Auto']    = true;
            ['Value']   = 0.121;
        };
        ['Method']     = 'Auto';
        ['Follow']     = 'Camera';
        ['Smoothness'] = 0.0068;
        ['Target']     = {
            ['BasePart'] = 'UpperTorso';

            ['Closest']  = {
                ['Enabled']   = true;
                ['Raycast']   = false;
                ['Selection'] = 'Part';
                ['Axis']      = 'Center';
                ['Sharpness'] = 0.65;
                ['Reduce']    = {
                    ['Center'] = 0.45;
                    ['All']    = 0.45;
                };
            };
        };
        ['Fov']        = {
            ['Method']    = '2d-Box';
            ['2d-Circle'] = {
                ['Visible'] = false;
                ['Size']    = 100;
                ['Color']   = {255, 255, 255};
            };
        };

        ['Toggle']     = {
            ['Enabled'] = true;
            ['Holding'] = false;
            ['Keybind'] = {'M', 'MouseButton2', 'Keyboard'};
        };

        ['Activation'] = {
            ['Holding']       = true;
            ['Unlock Method'] = 'Normal';
            ['Keybind']       = {'Q', 'MouseButton2', 'Keyboard'};
        };
    };


    ['Triggerbot']         = {
        ['Enabled']     = true;
        ['Method']      = 'Auto';

        ['Prediction']  = {
            ['Enabled'] = true;
            ['Auto']    = true;
            ['Value']   = 0.121;
        };
        ['TargetOnly']  = false;
        ['Delay']       = 1;

        ['Toggle']      = {
            ['Enabled'] = true;
            ['Holding'] = false;
            ['Keybind'] = {'V', 'MouseButton2', 'Keyboard'};
        };

        ['Activation']  = {
            ['Enabled'] = true;
            ['Holding'] = true;
            ['Keybind'] = {'Q', 'MouseButton2', 'Mouse'};
        };
        ['Fov']         = {
            ['Method']    = 'Character';
            ['Character'] = 1.2;
        };
    };


    ['Whitelist']          = {
        ['Enabled']   = false;
        ['Method']    = 'Friend';
        ['Players']   = {};
        ['AssignKey'] = {
            ['Keybind'] = {'R', 'MouseButton2', 'Keyboard'};
        };
        ['Clear Key'] = {
            ['Enabled'] = false;
            ['Keybind'] = {'Backspace', 'MouseButton2', 'Keyboard'};
        };
    };


    ['ESP']                = {
        ['Enabled']      = true;
        ['VisibleCheck'] = false;
        ['Names']        = true;
        ['KnockedCheck'] = true;
        ['DeadCheck']    = true;
        ['Target Pulse'] = true;
        ['Box Opacity']  = {
            ['Enabled'] = false;
            ['White']   = 0.25;
            ['Friend']  = 0.4;
            ['Target']  = 1;
        };
        ['Toggle']       = {
            ['Enabled'] = true;
            ['Holding'] = false;
            ['Keybind'] = {'Z', 'MouseButton2', 'Keyboard'};
        };
    };


    ['2d-Box']             = {
        ['Silent Aim'] = {
            ['Visible'] = true;
            ['Name']    = {true, 'DisplayName'};
            ['Color']   = {['Box'] = {{255, 255, 255}, {0, 0, 0}}, ['Target'] = {255, 223, 0}};
            ['Size']    = {['Height'] = 4.3; ['Width'] = 5};
        };
        ['Aim Assist'] = {
            ['Visible'] = false;
            ['Name']    = {false, 'DisplayName'};
            ['Color']   = {['Box'] = {{255, 255, 255}, {0, 0, 0}}, ['Target'] = {255, 223, 0}};
            ['Size']    = {['Height'] = 4.3; ['Width'] = 5};
        };
        ['Triggerbot'] = {
            ['Visible'] = false;
            ['Name']    = {false, 'DisplayName'};
            ['Color']   = {['Box'] = {{255, 255, 255}, {0, 0, 0}}, ['Target'] = {255, 223, 0}};
            ['Size']    = {['Height'] = 4.3; ['Width'] = 5};
        };
    };


    ['Misc']               = {
        ['AntiAfk']     = true;
        ['AntiFling']   = true;
        ['Mod Detect']  = {
            ['Enabled']      = false;
            ['Mode']         = 'Group';
            ['Group ID']     = 996191638;
            ['Alert']        = 'Notification';
            ['Notification'] = {['Duration'] = 6};
            ['Webhook']      = {['URL'] = ''};
        };

        ['Macro Abuse'] = {
            ['Enabled']          = false;
            ['Triggerbot check'] = false;
            ['Macro Check']      = true;
        };

        ['Panic']       = {
            ['Enabled'] = true;
            ['Keybind'] = {'E', 'MouseButton2', 'Keyboard'};
        };

        ['Prefire']     = {
            ['Enabled'] = false;
            ['Range']   = 100;
            ['Delay']   = 0.01;
            ['Holding'] = true;
            ['Keybind'] = {'C', 'MouseButton2', 'Keyboard'};
        };
    };


    ['Gun Specifications'] = {
        ['Enabled']          = false;
        ['Ranges']           = {
            ['Enabled'] = true;
            ['Close']  = 15;
            ['Medium'] = 30;
            ['Far']    = 90;
        };
        ['Revolver']         = {
            ['Close']  = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 5.1; ['Width'] = 5.1};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 5.1; ['Width'] = 5.1};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 5.1; ['Width'] = 5.1};
            end;
            ['Medium'] = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 5.5; ['Width'] = 5.5};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 5.5; ['Width'] = 5.5};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 5.5; ['Width'] = 5.5};
            end;
            ['Far']    = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 4.5; ['Width'] = 5};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 4.5; ['Width'] = 5};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 4.5; ['Width'] = 5};
            end;
        };
        ['Double-Barrel SG'] = {
            ['Close']  = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 6; ['Width'] = 7};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 6; ['Width'] = 7};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 6; ['Width'] = 7};
            end;
            ['Medium'] = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 5; ['Width'] = 6};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 5; ['Width'] = 6};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 5; ['Width'] = 6};
            end;
            ['Far']    = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 5; ['Width'] = 5};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 5; ['Width'] = 5};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 5; ['Width'] = 5};
            end;
        };
        ['TacticalShotgun']  = {
            ['Close']  = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 7; ['Width'] = 7};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 7; ['Width'] = 7};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 7; ['Width'] = 7};
            end;
            ['Medium'] = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 6; ['Width'] = 6};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 6; ['Width'] = 6};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 6; ['Width'] = 6};
            end;
            ['Far']    = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 5; ['Width'] = 5};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 5; ['Width'] = 5};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 5; ['Width'] = 5};
            end;
        };
        ['Shotgun']          = {
            ['Close']  = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 7; ['Width'] = 7};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 7; ['Width'] = 7};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 7; ['Width'] = 7};
            end;
            ['Medium'] = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 6; ['Width'] = 6};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 6; ['Width'] = 6};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 6; ['Width'] = 6};
            end;
            ['Far']    = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 5; ['Width'] = 5};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 5; ['Width'] = 5};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 5; ['Width'] = 5};
            end;
        };
        ['Usp']              = {
            ['Close']  = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 6; ['Width'] = 5};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 6; ['Width'] = 5};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 6; ['Width'] = 5};
            end;
            ['Medium'] = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 6; ['Width'] = 5};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 6; ['Width'] = 5};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 6; ['Width'] = 5};
            end;
            ['Far']    = function()
                neoperro['2d-Box']['Silent Aim']['Size'] = {['Height'] = 5; ['Width'] = 4};
                neoperro['2d-Box']['Aim Assist']['Size'] = {['Height'] = 5; ['Width'] = 4};
                neoperro['2d-Box']['Triggerbot']['Size'] = {['Height'] = 5; ['Width'] = 4};
            end;
        };
    };
};

loadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()
