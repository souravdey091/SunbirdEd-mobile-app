import { TelemetryGeneratorService } from '../../../services/telemetry-generator.service';
import { TranslateService } from '@ngx-translate/core';
import { Events, PopoverController, NavParams, ModalController } from '@ionic/angular';
import { Platform, ToastController } from '@ionic/angular';
import { Component, Inject, OnInit } from '@angular/core';
import {
  AuthService,
  ContentDeleteResponse,
  ContentDeleteStatus,
  ContentService,
  CorrelationData,
  OAuthSession,
  Rollup,
  TelemetryObject
} from 'sunbird-sdk';
import { CommonUtilService } from '../../../services/common-util.service';
import { Environment, InteractSubtype, InteractType } from '../../../services/telemetry-constants';
import { SbPopoverComponent } from '../popups/sb-popover/sb-popover.component';
import { FileSizePipe } from '@app/pipes/file-size/file-size';
import { SbGenericPopoverComponent } from '../popups/sb-generic-popover/sb-generic-popover.component';
import * as moment from 'moment';
@Component({
  selector: 'app-content-actions',
  templateUrl: './content-actions.component.html',
  styleUrls: ['./content-actions.component.scss']
})
export class ContentActionsComponent implements OnInit {

  content: any;
  data: any;
  isChild = false;
  contentId: string;
  batchDetails: any;
  backButtonFunc = undefined;
  userId = '';
  pageName = '';
  showFlagMenu = true;
  public objRollup: Rollup;
  private corRelationList: Array<CorrelationData>;

  constructor(
    @Inject('CONTENT_SERVICE') private contentService: ContentService,
    private navParams: NavParams,
    private toastCtrl: ToastController,
    public popoverCtrl: PopoverController,
    @Inject('AUTH_SERVICE') private authService: AuthService,
    private events: Events,
    private translate: TranslateService,
    private platform: Platform,
    private commonUtilService: CommonUtilService,
    private telemetryGeneratorService: TelemetryGeneratorService,
    private fileSizePipe: FileSizePipe,
    private popOverCtrl: PopoverController
  ) {
    this.content = this.navParams.get('content');
    this.data = this.navParams.get('data');
    this.batchDetails = this.navParams.get('batchDetails');
    this.pageName = this.navParams.get('pageName');
    this.objRollup = this.navParams.get('objRollup');
    this.corRelationList = this.navParams.get('corRelationList');

    if (this.navParams.get('isChild')) {
      this.isChild = true;
    }

    this.contentId = (this.content && this.content.identifier) ? this.content.identifier : '';
    this.backButtonFunc = this.platform.backButton.subscribeWithPriority(10, () => {
      this.popOverCtrl.dismiss();
      this.backButtonFunc.unsubscribe();
    });
    this.getUserId();
  }

  ngOnInit() {

  }

  getUserId() {
    this.authService.getSession().subscribe((session: OAuthSession) => {
      if (!session) {
        this.userId = '';
      } else {
        this.userId = session.userToken ? session.userToken : '';
        // Needed: this get executed if user is on course details page.
        if (this.pageName === 'course' && this.userId) {
          // If course is not enrolled then hide flag/report issue menu.
          // If course has batchId then it means it is enrolled course
          this.showFlagMenu = !!this.content.batchId;
        }
      }
    });
  }

  /**
   * Construct content delete request body
   */
  getDeleteRequestBody() {
    return {
      contentDeleteList: [{
        contentId: this.contentId,
        isChildContent: this.isChild
      }]
    };
  }

  /**
   * Close popover
   */
  async close(i) {
    switch (i) {
      case 0: {
        const confirm = await this.popoverCtrl.create({
          component: SbPopoverComponent,
          componentProps: {
            content: this.content,
            // isChild: this.isDepthChild,
            objRollup: this.objRollup,
            // pageName: PageId.COLLECTION_DETAIL,
            corRelationList: this.corRelationList,
            sbPopoverHeading: this.commonUtilService.translateMessage('REMOVE_FROM_DEVICE'),
            // sbPopoverMainTitle: this.commonUtilService.translateMessage('REMOVE_FROM_DEVICE_MSG'),
            sbPopoverMainTitle: this.content.name,
            actionsButtons: [
              {
                btntext: this.commonUtilService.translateMessage('REMOVE'),
                btnClass: 'popover-color'
              },
            ],
            icon: null,
            metaInfo:
              // this.contentDetail.contentTypesCount.TextBookUnit + 'items' +
              // this.batchDetails.courseAdditionalInfo.leafNodesCount + 'items' +
              '(' + this.fileSizePipe.transform(this.content.size, 2) + ')',
            sbPopoverContent: 'Are you sure you want to delete ?'
          },
          cssClass: 'sb-popover danger',
        });
        await confirm.present();
        const response = await confirm.onDidDismiss();

        if (response.data) {
          this.deleteContent();
        }
        break;
      }
      case 1: {
        this.popOverCtrl.dismiss();
        // this.reportIssue();
        break;
      }
    }
  }

  /*
   * shows alert to confirm unenroll send back user selection */
  async unenroll() {
    const confirm = await this.popoverCtrl.create({
      component: SbGenericPopoverComponent,
      componentProps: {
        sbPopoverHeading: this.commonUtilService.translateMessage('UNENROLL_FROM_COURSE'),
        sbPopoverMainTitle: this.commonUtilService.translateMessage('UNENROLL_CONFIRMATION_MESSAGE'),
        actionsButtons: [
          {
            btntext: this.commonUtilService.translateMessage('CANCEL'),
            btnClass: 'sb-btn sb-btn-sm  sb-btn-outline-info'
          },
          {
            btntext: this.commonUtilService.translateMessage('CONFIRM'),
            btnClass: 'popover-color'
          }
        ],
        icon: null
      },
      cssClass: 'sb-popover info',
    });
    await confirm.present();
    const response = await confirm.onDidDismiss();

    let unenroll: any = false;
    if (response.data.leftBtnClicked == null) {
      unenroll = false;
    } else if (response.data.leftBtnClicked) {
      unenroll = false;
    } else {
      unenroll = true;
    }
    this.popOverCtrl.dismiss({
      caller: 'unenroll',
      unenroll
    });
  }

  async deleteContent() {
    const telemetryObject = new TelemetryObject(this.content.identifier, this.content.contentType, this.content.pkgVersion);

    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.TOUCH,
      InteractSubtype.DELETE_CLICKED,
      Environment.HOME,
      this.pageName,
      telemetryObject,
      undefined,
      this.objRollup,
      this.corRelationList);

    const loader = await this.commonUtilService.getLoader();
    await loader.present();
    this.contentService.deleteContent(this.getDeleteRequestBody()).toPromise()
      .then(async (data: ContentDeleteResponse[]) => {
        console.log('data on delete', data);
        await loader.dismiss();
        if (data && data[0].status === ContentDeleteStatus.NOT_FOUND) {
          this.showToaster(this.getMessageByConstant('CONTENT_DELETE_FAILED'));
        } else {
          // Publish saved resources update event
          this.events.publish('savedResources:update', {
            update: true
          });
          console.log('delete response: ', data);
          this.showToaster(this.getMessageByConstant('MSG_RESOURCE_DELETED'));
          this.popOverCtrl.dismiss({ isDeleted: true });
        }
      }).catch(async (error: any) => {
        await loader.dismiss();
        console.log('delete response: ', error);
        this.showToaster(this.getMessageByConstant('CONTENT_DELETE_FAILED'));
        this.popOverCtrl.dismiss();
      });
  }


  async showToaster(message) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  getMessageByConstant(constant: string) {
    let msg = '';
    this.translate.get(constant).subscribe(
      (value: any) => {
        msg = value;
      }
    );
    return msg;
  }
  // check wheather to show Unenroll button in overflow menu or not
  showUnenrollButton(): boolean {
    return (this.data &&
      (this.data.batchStatus !== 2 &&
        (this.data.contentStatus === 0 || this.data.contentStatus === 1 || this.data.courseProgress < 100) &&
        this.data.enrollmentType !== 'invite-only'));
  }

  isUnenrollDisabled() {
    let isEnrolledDisabled = true;
    let progress;
    const todayDate = moment(new Date()).format('YYYY-MM-DD');
    if (this.data && this.data.courseProgress) {
      progress = this.data.courseProgress ? Math.round(this.data.courseProgress) : 0;
    }
    if (!this.batchDetails) {
      return isEnrolledDisabled;
    }
    if ((!(this.batchDetails && this.batchDetails.hasOwnProperty('endDate')) ||
      (this.batchDetails.endDate > todayDate)) &&
      (this.batchDetails.enrollmentType === 'open') &&
      (progress !== 100)) {
      isEnrolledDisabled = false;
    }
    return isEnrolledDisabled;
  }
}
