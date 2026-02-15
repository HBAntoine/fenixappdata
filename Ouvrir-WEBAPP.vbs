' ============================================================
' Ouvrir-WEBAPP.vbs - Ouverture intelligente avec auto-publish
'
' Detecte si Events.csv a ete modifie depuis le dernier push.
' Si oui : publie automatiquement puis ouvre le navigateur.
' Si non : ouvre directement le navigateur.
' ============================================================

Option Explicit

Dim fso, shell, scriptDir, csvPath, lastPubPath
Dim csvModified, lastPubDate, needPublish
Dim batPath, exitCode

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Dossier du script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
csvPath = scriptDir & "\Events.csv"
lastPubPath = scriptDir & "\.last-publish"
batPath = scriptDir & "\Publier-MAJ.bat"

' -------------------------------------------------------
' Verifier si Events.csv existe
' -------------------------------------------------------
If Not fso.FileExists(csvPath) Then
    MsgBox "Events.csv introuvable dans :" & vbCrLf & scriptDir, vbExclamation, "Fenix Stats"
    WScript.Quit
End If

' -------------------------------------------------------
' Comparer les dates
' -------------------------------------------------------
needPublish = False
csvModified = fso.GetFile(csvPath).DateLastModified

If fso.FileExists(lastPubPath) Then
    ' Lire le timestamp de la derniere publication
    Dim f, lastPubStr
    Set f = fso.OpenTextFile(lastPubPath, 1)
    lastPubStr = Trim(f.ReadLine)
    f.Close

    lastPubDate = CDate(lastPubStr)

    If csvModified > lastPubDate Then
        needPublish = True
    End If
Else
    ' Pas de fichier .last-publish = jamais publie
    needPublish = True
End If

' Verifier aussi si Effectifs/ a des photos plus recentes
Dim effectifsDir
effectifsDir = scriptDir & "\Effectifs"
If fso.FolderExists(effectifsDir) Then
    If CheckFolderNewer(effectifsDir, lastPubPath) Then
        needPublish = True
    End If
End If

' -------------------------------------------------------
' Publier si necessaire
' -------------------------------------------------------
If needPublish Then
    ' Notification
    shell.Popup "Nouvelles donnees detectees !" & vbCrLf & vbCrLf & _
                "Publication en cours..." & vbCrLf & _
                "(cette fenetre va se fermer automatiquement)", _
                3, "Fenix Stats - Mise a jour", vbInformation

    ' Executer Publier-MAJ.bat et attendre la fin
    If fso.FileExists(batPath) Then
        exitCode = shell.Run("cmd /c """ & batPath & """", 1, True)

        If exitCode = 0 Then
            ' Succes : sauvegarder le timestamp
            Dim fw
            Set fw = fso.CreateTextFile(lastPubPath, True)
            fw.WriteLine Now()
            fw.Close

            shell.Popup "Publication reussie !" & vbCrLf & vbCrLf & _
                        "Le site va s'ouvrir dans 10 secondes" & vbCrLf & _
                        "(temps de deploiement Netlify)", _
                        5, "Fenix Stats", vbInformation

            ' Attendre le deploiement Netlify
            WScript.Sleep 10000
        Else
            MsgBox "La publication a echoue (code " & exitCode & ")." & vbCrLf & _
                   "Verifiez la fenetre de commandes.", _
                   vbExclamation, "Fenix Stats - Erreur"
        End If
    Else
        MsgBox "Publier-MAJ.bat introuvable !", vbExclamation, "Fenix Stats"
    End If
Else
    ' Rien a publier
    shell.Popup "Donnees a jour - ouverture du site...", _
                2, "Fenix Stats", vbInformation
End If

' -------------------------------------------------------
' Ouvrir le navigateur
' -------------------------------------------------------
shell.Run "https://fenixappdata.netlify.app"

Set shell = Nothing
Set fso = Nothing
WScript.Quit


' -------------------------------------------------------
' Fonction : verifie si un dossier contient des fichiers
'            plus recents que .last-publish
' -------------------------------------------------------
Function CheckFolderNewer(folderPath, lastPubFile)
    CheckFolderNewer = False

    If Not fso.FileExists(lastPubFile) Then
        CheckFolderNewer = True
        Exit Function
    End If

    Dim lf, lpStr, lpDate
    Set lf = fso.OpenTextFile(lastPubFile, 1)
    lpStr = Trim(lf.ReadLine)
    lf.Close
    lpDate = CDate(lpStr)

    Dim folder, subfolder, file
    Set folder = fso.GetFolder(folderPath)

    ' Verifier les fichiers dans les sous-dossiers
    For Each subfolder In folder.SubFolders
        For Each file In subfolder.Files
            If LCase(fso.GetExtensionName(file.Name)) <> "json" Then
                If file.DateLastModified > lpDate Then
                    CheckFolderNewer = True
                    Exit Function
                End If
            End If
        Next
    Next
End Function
