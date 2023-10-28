import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType
} from '@angular/common/http';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NbToastrService } from '@nebular/theme';
import { mergeMap } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { FileUploadType } from './file-upload/file-upload.component';
import { LocalUserService, MapsService } from '@momentum/frontend/data';
import {
  MapCreditType,
  Gamemode,
  GamemodeName,
  ZoneType
} from '@momentum/constants';
import { GamemodePrefix } from '@momentum/constants';
import { SortedMapCredits } from '../map-credits/sorted-map-credits.class';
import { vdf } from 'fast-vdf';

export interface ImageFilePreview {
  dataBlobURL: string;
  file: File;
}

const youtubeRegex = /[\w-]{11}/;

@Component({
  selector: 'mom-map-upload-form',
  templateUrl: './map-upload-form.component.html',
  styleUrls: ['./map-upload-form.component.scss']
})
export class MapUploadFormComponent implements OnInit, AfterViewInit {
  protected readonly FileUploadType = FileUploadType;
  protected readonly MapType = Gamemode;

  protected readonly MapTypeName = GamemodeName;

  @ViewChild('datepicker', { static: false }) datePicker;
  @ViewChild('stepper', { static: false }) stepper;

  mapFile: File;
  avatarFile: File;
  zoneFile: File;
  avatarFilePreview: ImageFilePreview;
  extraImages: ImageFilePreview[];
  extraImagesLimit: number;
  mapUploadPercentage: number;
  isUploadingMap: boolean;
  credits: SortedMapCredits;
  inferredMapType: boolean;
  mapPreview: any;
  // mapPreview: PartialDeep<
  //   { map: MMap; images: MapImage[] },
  //   { recurseIntoArrays: true }
  // >;
  tracks: any; // CreateMapTrack[];

  filesForm: FormGroup = this.fb.group({
    map: ['', [Validators.required, Validators.pattern(/.+(\.bsp)/)]],
    avatar: [
      '',
      [Validators.required, Validators.pattern(/.+(\.(pn|jpe?)g)/i)]
    ],
    youtubeURL: ['', [Validators.pattern(youtubeRegex)]]
  });
  infoForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(32)]],
    type: [Gamemode.AHOP, Validators.required],
    description: ['', [Validators.required, Validators.maxLength(1000)]],
    creationDate: [
      new Date(),
      [Validators.required, Validators.max(Date.now())]
    ],
    zones: ['', [Validators.required, Validators.pattern(/.+(\.zon)/)]]
  });
  creditsForm: FormGroup = this.fb.group({
    authors: [[], Validators.required]
  });
  forms: FormGroup[] = [this.filesForm, this.infoForm, this.creditsForm];

  get map() {
    return this.filesForm.get('map');
  }
  get avatar() {
    return this.filesForm.get('avatar');
  }
  get youtubeURL() {
    return this.filesForm.get('youtubeURL');
  }
  get name() {
    return this.infoForm.get('name');
  }
  get type() {
    return this.infoForm.get('type');
  }
  get description() {
    return this.infoForm.get('description');
  }
  get creationDate() {
    return this.infoForm.get('creationDate');
  }

  constructor(
    private mapsService: MapsService,
    private router: Router,
    private localUsrService: LocalUserService,
    private toasterService: NbToastrService,
    private fb: FormBuilder
  ) {
    this.stepper = null;
    this.isUploadingMap = false;
    this.mapUploadPercentage = 0;
    this.extraImagesLimit = 5;
    this.credits = new SortedMapCredits();
    this.extraImages = [];
    this.tracks = [];
    this.inferredMapType = false;
    this.zoneFile = null;
    this.avatarFile = null;
    this.mapFile = null;
  }

  ngAfterViewInit() {
    this.datePicker.max = new Date();
    this.datePicker.date = new Date();
  }

  ngOnInit(): void {
    this.youtubeURL.valueChanges.subscribe(() => this.generatePreviewMap());
    this.creditsForm.valueChanges.subscribe(() => this.generatePreviewMap());
    this.infoForm.valueChanges.subscribe(() => this.generatePreviewMap());
  }

  onMapFileSelected(file: File) {
    this.mapFile = file;
    this.map.patchValue(this.mapFile.name);
    const nameVal = this.mapFile.name.replaceAll(/.bsp/g, '').toLowerCase();
    this.name.patchValue(nameVal);

    // Infer type from name
    let type = Gamemode.AHOP;
    for (const [key, prefix] of GamemodePrefix.entries()) {
      if (nameVal.startsWith(prefix + '_')) {
        type = key;
        break;
      }
    }

    this.type.patchValue(type);
    this.inferredMapType = false; // TODO: was this: type !== Gamemode.UNKNOWN;
  }

  async onAvatarFileSelected(file: File) {
    this.avatarFile = file;
    this.avatarFilePreview = {
      dataBlobURL: await this.readAsDataUrl(file),
      file: file
    };
    this.generatePreviewMap();
    this.avatar.patchValue(this.avatarFile.name);
  }

  parseTrack(
    trackNum: number,
    // TODO: For 0.10.0 zon files, make types for the parsed kv1/kv3 file
    track: object
  ) {
    //: CreateMapTrack {
    const trackReturn: any /* CreateMapTrack */ = {
      trackNum: trackNum,
      numZones: 0,
      isLinear: false,
      difficulty: 1,
      zones: []
    };
    // This code is really ugly but I don't wanna mess with it too much.
    // Will rewrite at 0.10.0. - Tom
    for (const zone in track) {
      if (Object.hasOwn(track, zone)) {
        const zoneNum = Number(zone);
        trackReturn.numZones = Math.max(trackReturn.numZones, zoneNum);

        const zoneMdl: any /* CreateMapZone */ = {
          zoneNum: zoneNum,
          triggers: []
        };
        for (const trigger in track[zone].triggers) {
          if (Object.hasOwn(track[zone].triggers, trigger)) {
            const triggerObj = track[zone].triggers[trigger];
            if (!trackReturn.isLinear)
              trackReturn.isLinear =
                triggerObj.type === ZoneType.ZONE_CHECKPOINT;
            const zoneMdlTrigger: any = {
              type: triggerObj.type,
              points: triggerObj.points,
              pointsZPos: triggerObj.pointsZPos,
              pointsHeight: triggerObj.pointsHeight
            };
            if (triggerObj.zoneProps)
              zoneMdlTrigger.zoneProps = {
                properties: triggerObj.zoneProps.properties
              };
            zoneMdl.triggers.push(zoneMdlTrigger as any);
          }
        }
        // Old code - wtf is this?
        // if (zoneNum === 0) delete zoneMdl.stats;
        trackReturn.zones.push(zoneMdl);
      }
    }
    return trackReturn;
  }

  async onZoneFileSelected(file: File) {
    this.tracks = [];
    this.zoneFile = file;
    const zoneData = await (file as Blob).text();
    const zoneFile = vdf.parse(zoneData) as any;
    const tracks = zoneFile.tracks;
    for (const trackNum in tracks) {
      if (Object.hasOwn(tracks, trackNum)) {
        this.tracks.push(this.parseTrack(Number(trackNum), tracks[trackNum]));
      }
    }
    this.generatePreviewMap();
    this.infoForm.patchValue({ zones: this.zoneFile.name });
  }

  onSubmit($event) {
    if (
      !(this.filesForm.valid && this.infoForm.valid && this.creditsForm.valid)
    )
      return;
    // Prevent from spamming submit button
    $event.target.disabled = true;

    let mapCreated = false;
    let mapID = -1;

    const mapObject: any = {
      // CreateMap = {
      name: this.name.value,
      fileName: this.name.value, // TODO: Proper filename field
      // type: this.type.value,
      info: {
        description: this.description.value,
        youtubeID: this.mapPreview.map.info.youtubeID,
        numTracks: this.tracks.length,
        creationDate: this.creationDate.value
      },
      tracks: this.tracks,
      credits: this.credits.getAllSubmittable()
    };

    this.mapsService
      .createMap(mapObject)
      .pipe(
        mergeMap((response) => {
          mapID = response.body.id;
          mapCreated = true;
          this.toasterService.success(
            'Please wait for the map file to upload',
            'Map successfully created'
          );
          return forkJoin([
            this.mapsService.updateMapAvatar(mapID, this.avatarFile),
            ...this.extraImages.map((image) =>
              this.mapsService.createMapImage(mapID, image.file)
            )
          ]);
        }),
        mergeMap(() => this.mapsService.uploadMapFile(mapID, this.mapFile))
      )
      .subscribe({
        next: (event: HttpEvent<any>) => {
          switch (event.type) {
            case HttpEventType.Sent:
              // upload started
              this.isUploadingMap = true;
              break;
            case HttpEventType.Response:
              this.onSubmitSuccess();
              break;
            case HttpEventType.UploadProgress: {
              const calc: number = Math.round(
                (event['loaded'] / event['total']) * 100
              );
              if (this.mapUploadPercentage !== calc)
                this.mapUploadPercentage = calc;
              break;
            }
          }
        },
        error: (httpError: HttpErrorResponse) => {
          const errorMessage = httpError?.error?.message ?? 'Unknown error';
          $event.target.disabled = false;
          this.isUploadingMap = false;
          if (mapCreated) this.onSubmitSuccess();
          this.toasterService.danger(
            errorMessage,
            'Something went wrong during submission!'
          );
        }
      });
  }

  private onSubmitSuccess() {
    this.isUploadingMap = false;
    this.router.navigate(['/dashboard/maps/uploads']);
  }

  markFormAsDirty(formG: FormGroup) {
    for (const i in formG.controls) formG.controls[i].markAsTouched();
  }

  touchForm(selected: number) {
    if (selected >= 0 && selected < this.forms.length)
      this.markFormAsDirty(this.forms[selected]);
  }

  onCreditChanged() {
    this.creditsForm
      .get('authors')
      .patchValue(this.credits[MapCreditType.AUTHOR]);
  }

  readAsDataUrl(img: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('loadend', () =>
        resolve(reader.result as string)
      );
      reader.addEventListener('error', () =>
        reject(new Error('Error parsing file'))
      );
      reader.readAsDataURL(img);
    });
  }

  async onExtraImageSelected(file: File) {
    if (this.extraImages.length >= this.extraImagesLimit) return;
    this.extraImages.push({
      dataBlobURL: await this.readAsDataUrl(file),
      file: file
    });
    this.generatePreviewMap();
  }

  removeExtraImage(img: ImageFilePreview) {
    this.extraImages.splice(this.extraImages.indexOf(img), 1);
  }

  generatePreviewMap(): void {
    const youtubeIDMatch = this.youtubeURL.value.match(youtubeRegex);
    this.mapPreview = {
      map: {
        id: 0,
        name: this.name.value,
        type: this.type.value as any, // TODO
        hash: 'not-important-yet',
        status: 0,
        info: {
          id: 0,
          description: this.description.value,
          youtubeID: youtubeIDMatch ? youtubeIDMatch[0] : undefined,
          numTracks: this.tracks.length,
          creationDate: this.creationDate.value
        },
        mainTrack: this.tracks.length > 0 ? this.tracks[0] : undefined,
        tracks: this.tracks,
        credits: Object.entries(this.credits).flatMap(([type, users]) =>
          users.map((credit) => ({
            type: +type,
            user: credit.user
          }))
        ),
        submitter: this.localUsrService.localUser
      },
      images: []
    };
    if (this.avatarFilePreview) {
      this.mapPreview.images.push({
        id: 0,
        mapID: 0,
        small: this.avatarFilePreview.dataBlobURL,
        medium: this.avatarFilePreview.dataBlobURL,
        large: this.avatarFilePreview.dataBlobURL
      });
    }
    for (const image of this.extraImages)
      this.mapPreview.images.push({
        id: 0,
        mapID: 0,
        small: image.dataBlobURL,
        medium: image.dataBlobURL,
        large: image.dataBlobURL
      });
  }

  onRemoveZones() {
    this.tracks = [];
    this.zoneFile = undefined;
    this.infoForm.patchValue({ zones: '' });
  }
}
