

<template>
    <div class="content blog" id="blog">
        <ModuleHeader :title="blog.header.title" :sub-title="blog.header.subtitle"/>
      <a-timeline >
        <a-timeline-item color='white'  data-aos="fade-in" v-for="card in blog.cards" v-bind:key="card.title + card.subtitle">
          <a-card class="experience-card" :bodyStyle="{background:'#1e1f22'}" :bordered="false" style="width: 100%" :headStyle="{background:'#1e1f22'} ">
            <a-col :xs="24" :sm="24" :md="24" :lg="10" :xl="8">

              <img data-aos="fade-in" class="avatar" draggable="false" :src="require('../assets/project/'+card.img)">
            </a-col>



              <a-col class="color-content col" :xs="24" :sm="24" :md="24" :lg="14" :xl="16">
              <h1 class="title" >{{card.title}}</h1>
              <span v-if="!!card.subtitle" class="sub-title">
                {{card.subtitle}}
              </span>
                <a-row class="keys-col" v-for="(value, name) in card.keys" v-bind:key="name"
                      :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
              <span class="key">{{name}}:</span>
              <a class="value"  :href="value" target="_blank">{{value | simplifyUrl}}</a>
            </a-row >
                <vue-markdown  style="margin-top: .8em;color: #bbbdc2; font-size: .8rem; overflow: scroll;" data-aos="fade-in">{{card.md}}</vue-markdown>

              </a-col>
          </a-card>
        </a-timeline-item>
      </a-timeline>

    </div>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';
    import ModuleHeader from '@/components/module/ModuleHeader.vue';
    import ModuleSkeleton from '@/components/module/ModuleSkeleton.vue';
    import VueMarkdown from 'vue-markdown';

    // import api from '@/api';
    // import {Rss} from '@/api/rss_interface';
    import {Module} from '@/api/user_interface';

    @Component({
        components: {
            ModuleHeader,
            ModuleSkeleton,
            VueMarkdown,
        },
        computed: {
            blog(): Module {
                return this.$store.getters.getModule('blog');
            },
        },
      methods: {
        /**
         * 检测是否为url
         * @param content 需要检测的内容
         */
        isUrl(content: string): boolean {
          const strRegex = '^(((https|http|ftp|rtsp|mms):)?//)'
              + '?(([0-9a-z_!~*\'().&=+$%-]+: )?[0-9a-z_!~*\'().&=+$%-]+@)?' // ftp的user@
              + '(([0-9]{1,3}.){3}[0-9]{1,3}' // IP形式的URL- 199.194.52.184
              + '|' // 允许IP和DOMAIN（域名）
              + '([0-9a-z_!~*\'()-]+.)*' // 域名- www.
              + '([0-9a-z][0-9a-z-]{0,61})?[0-9a-z].' // 二级域名
              + '[a-z]{2,6})' // first level domain- .com or .museum
              + '(:[0-9]{1,4})?' // 端口- :80
              + '((/?)|' // a slash isn't required if there is no file name
              + '(/[0-9a-z_!~*\'().;?:@&=+$,%#-]+)+/?)$';
          const re = new RegExp(strRegex);
          return re.test(content);
        },
      },
      filters: {
        /**
         * 简化url
         * @param url
         */
        simplifyUrl(url: string): string {
          const strRegex = /^(((https|http|ftp|rtsp|mms):)?\/\/)?/;
          return url.replace(strRegex, '');
        },
      },


    })
    export default class Blog extends Vue {


    }
</script>

<style scoped lang="scss">
    @import '../styles/variable';
    @media screen and (max-width: $--screen-md-min) {
      .col {

        &.color-content {
          margin-top: 1.5rem;
        }
      }
    }
    .keys-col {


      word-break: break-all;
      padding-right: 1rem;

      .key {
        margin-right: .5rem;
        font-weight: bold;
      }

      .value {
        color: inherit;
        text-decoration: underline;
      }
    }

    .blog {
      .col {
        padding: 0 1rem;
      }

      .avatar {
        display: block;
        width: 100%;
        border-radius: 5px;
      }
        .description {
            * {
                margin-right: 4px;
            }

            .title {
                color: $--selection-color
            }

            .pub-date {
                color: $--color-gray;
            }
        }

        .desc {
            color: $--color-gray;
            padding-left: 0em;
            display: inline-block;
        }

        @media screen and (max-width: $--screen-sm-min) {
            .description {
                .tag {
                    display: block;
                }
            }

            .desc {
                display: none;
            }
        }
      .experience-card {



        .title {
          text-shadow: 0 0 5px rgba(255, 255, 255, 0.7);
          color: white;
          width: 100%;
          font-size: 1.2rem;
          overflow: scroll;
          margin: 0;

        }

        .sub-title {
          word-break: break-all;
          text-shadow: 0 0 5px rgba(255, 255, 255, 0.7);
          color: white;
          width: 100%;

          display: block;
          margin-top: .5rem;
          margin-bottom: .5rem;
        }
      }
    }
</style>
